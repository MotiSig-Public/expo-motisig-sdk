#import "NotificationService.h"

#import <MobileCoreServices/MobileCoreServices.h>
#import <os/log.h>

@interface NotificationService ()

@property (nonatomic, copy) void (^contentHandler)(UNNotificationContent *contentToDeliver);
@property (nonatomic, strong) UNMutableNotificationContent *bestAttemptContent;
/// JSON-serializable dict rows surfaced to the host app as `userInfo._motisigNseDebug` (no App Group required).
@property (nonatomic, strong) NSMutableArray<NSDictionary *> *motisigNseDebugEvents;

@end

static os_log_t MotiSigNSELog(void) {
  static os_log_t log;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    log = os_log_create("ai.motisig.sdk.expo", "NotificationServiceExtension");
  });
  return log;
}

/// Console verbosity for `os_log` only. `userInfo._motisigNseDebug` is always populated regardless.
/// Set `MotiSigNSEConsoleLogLevel` on the **Notification Service Extension** target Info.plist:
///   `silent` — no console lines
///   `error` — default when key omitted: failures only (download_error, reject_*, attach_error, time_will_expire, …)
///   `info` — errors + high-signal lines (entered, no_url, attach_ok)
///   `debug` — full detail (download URL, HTTP status/mime per response, unknown events)
typedef NS_ENUM(NSInteger, MotiSigNSEConsoleLogLevel) {
  MotiSigNSEConsoleLogLevelSilent = 0,
  MotiSigNSEConsoleLogLevelError = 1,
  MotiSigNSEConsoleLogLevelInfo = 2,
  MotiSigNSEConsoleLogLevelDebug = 3,
};

static MotiSigNSEConsoleLogLevel MotiSigNSEConsoleLogLevelRead(void) {
  static MotiSigNSEConsoleLogLevel level;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    id raw = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"MotiSigNSEConsoleLogLevel"];
    if ([raw isKindOfClass:[NSNumber class]]) {
      NSInteger n = [(NSNumber *)raw integerValue];
      if (n <= 0) {
        level = MotiSigNSEConsoleLogLevelSilent;
      } else if (n == 1) {
        level = MotiSigNSEConsoleLogLevelError;
      } else if (n >= 3) {
        level = MotiSigNSEConsoleLogLevelDebug;
      } else {
        level = MotiSigNSEConsoleLogLevelInfo;
      }
      return;
    }
    if (![raw isKindOfClass:[NSString class]] || [(NSString *)raw length] == 0) {
      level = MotiSigNSEConsoleLogLevelError;
      return;
    }
    NSString *s = [(NSString *)raw lowercaseString];
    if ([s isEqualToString:@"silent"] || [s isEqualToString:@"none"] || [s isEqualToString:@"off"]) {
      level = MotiSigNSEConsoleLogLevelSilent;
    } else if ([s isEqualToString:@"error"] || [s isEqualToString:@"errors"]) {
      level = MotiSigNSEConsoleLogLevelError;
    } else if ([s isEqualToString:@"info"]) {
      level = MotiSigNSEConsoleLogLevelInfo;
    } else if ([s isEqualToString:@"debug"] || [s isEqualToString:@"verbose"]) {
      level = MotiSigNSEConsoleLogLevelDebug;
    } else {
      level = MotiSigNSEConsoleLogLevelError;
    }
  });
  return level;
}

/// 1 = error-tier, 2 = info-tier, 3 = debug-only (noisy per-notification).
static BOOL MotiSigNSEShouldEmitConsole(int eventTier) {
  MotiSigNSEConsoleLogLevel L = MotiSigNSEConsoleLogLevelRead();
  if (L == MotiSigNSEConsoleLogLevelSilent) {
    return NO;
  }
  if (L == MotiSigNSEConsoleLogLevelError) {
    return eventTier <= 1;
  }
  if (L == MotiSigNSEConsoleLogLevelInfo) {
    return eventTier <= 2;
  }
  return YES;
}

static NSString *MotiSigSortedKeysSummary(NSDictionary *dict) {
  if (![dict isKindOfClass:[NSDictionary class]] || dict.count == 0) {
    return @"(none)";
  }
  NSArray *keys = [[dict allKeys] sortedArrayUsingSelector:@selector(compare:)];
  return [keys componentsJoinedByString:@","];
}

static NSString *MotiSigMimeTypeFromResponse(NSURLResponse *response) {
  if (![response isKindOfClass:[NSHTTPURLResponse class]]) {
    return @"";
  }
  NSString *ct = [(NSHTTPURLResponse *)response allHeaderFields][@"Content-Type"];
  if (![ct isKindOfClass:[NSString class]]) {
    return @"";
  }
  NSRange semi = [ct rangeOfString:@";"];
  if (semi.location != NSNotFound) {
    return [[ct substringToIndex:semi.location] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
  }
  return [ct stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
}

/// Returns a uniform type identifier string suitable for `UNNotificationAttachmentOptionsTypeHintKey`.
static NSString *MotiSigTypeHintForImage(NSString *mimeLower, NSString *pathExtensionLower) {
  if ([mimeLower containsString:@"image/jpeg"] || [mimeLower containsString:@"image/jpg"]) {
    return (NSString *)kUTTypeJPEG;
  }
  if ([mimeLower containsString:@"image/png"]) {
    return (NSString *)kUTTypePNG;
  }
  if ([mimeLower containsString:@"image/gif"]) {
    return (NSString *)kUTTypeGIF;
  }
  if ([mimeLower containsString:@"image/webp"]) {
    return @"org.webmproject.webp";
  }

  if ([pathExtensionLower isEqualToString:@"jpg"] || [pathExtensionLower isEqualToString:@"jpeg"]) {
    return (NSString *)kUTTypeJPEG;
  }
  if ([pathExtensionLower isEqualToString:@"png"]) {
    return (NSString *)kUTTypePNG;
  }
  if ([pathExtensionLower isEqualToString:@"gif"]) {
    return (NSString *)kUTTypeGIF;
  }
  if ([pathExtensionLower isEqualToString:@"webp"]) {
    return @"org.webmproject.webp";
  }
  return (NSString *)kUTTypeJPEG;
}

static BOOL MotiSigMimeAllowsImageAttach(NSString *mimeLower, NSString *pathExtensionLower) {
  if ([mimeLower hasPrefix:@"image/"]) {
    return YES;
  }
  // Many CDNs return binary bodies with octet-stream for images.
  if ([mimeLower isEqualToString:@"application/octet-stream"] || [mimeLower hasPrefix:@"application/octet-stream"]) {
    return [pathExtensionLower isEqualToString:@"jpg"] || [pathExtensionLower isEqualToString:@"jpeg"] ||
           [pathExtensionLower isEqualToString:@"png"] || [pathExtensionLower isEqualToString:@"gif"] ||
           [pathExtensionLower isEqualToString:@"webp"];
  }
  return NO;
}

static NSString *MotiSigFileExtensionForTypeHint(NSString *typeHint) {
  if ([typeHint isEqualToString:(NSString *)kUTTypePNG]) {
    return @"png";
  }
  if ([typeHint isEqualToString:(NSString *)kUTTypeGIF]) {
    return @"gif";
  }
  if ([typeHint isEqualToString:@"org.webmproject.webp"]) {
    return @"webp";
  }
  return @"jpg";
}

@implementation NotificationService

- (void)motisig_nseDebugAppend:(NSDictionary *)fields {
  if (!self.motisigNseDebugEvents) {
    self.motisigNseDebugEvents = [NSMutableArray array];
  }
  NSMutableDictionary *row = [NSMutableDictionary dictionaryWithDictionary:fields];
  row[@"ts"] = @([[NSDate date] timeIntervalSince1970]);
  [self.motisigNseDebugEvents addObject:row];

  NSString *ev = fields[@"event"];
  if ([ev isEqualToString:@"entered"]) {
    if (MotiSigNSEShouldEmitConsole(2)) {
      os_log(MotiSigNSELog(), "[motisig-nse] entered request id=%{public}@ userInfoKeys=%{public}@ apsKeys=%{public}@ mutable-content=%{public}@",
             fields[@"requestId"] ?: @"",
             fields[@"userInfoKeys"] ?: @"",
             fields[@"apsKeys"] ?: @"",
             fields[@"mutableContent"] ? [fields[@"mutableContent"] description] : @"nil");
    }
  } else if ([ev isEqualToString:@"no_url"]) {
    if (MotiSigNSEShouldEmitConsole(2)) {
      os_log(MotiSigNSELog(), "[motisig-nse] no image URL in userInfo");
    }
  } else if ([ev isEqualToString:@"bad_scheme"]) {
    if (MotiSigNSEShouldEmitConsole(1)) {
      os_log_error(MotiSigNSELog(), "[motisig-nse] invalid URL scheme for %{public}@", fields[@"url"] ?: @"");
    }
  } else if ([ev isEqualToString:@"download_start"]) {
    if (MotiSigNSEShouldEmitConsole(3)) {
      os_log(MotiSigNSELog(), "[motisig-nse] downloading %{public}@", fields[@"url"] ?: @"");
    }
  } else if ([ev isEqualToString:@"download_error"]) {
    if (MotiSigNSEShouldEmitConsole(1)) {
      os_log_error(MotiSigNSELog(), "[motisig-nse] download failed: %{public}@", fields[@"error"] ?: @"");
    }
  } else if ([ev isEqualToString:@"download_response"]) {
    if (MotiSigNSEShouldEmitConsole(3)) {
      os_log(MotiSigNSELog(), "[motisig-nse] response status=%{public}@ mime=%{public}@", fields[@"status"], fields[@"mime"] ?: @"");
    }
  } else if ([ev isEqualToString:@"reject_status"]) {
    if (MotiSigNSEShouldEmitConsole(1)) {
      os_log_error(MotiSigNSELog(), "[motisig-nse] skip attach: HTTP status %{public}@", fields[@"status"]);
    }
  } else if ([ev isEqualToString:@"reject_mime"]) {
    if (MotiSigNSEShouldEmitConsole(1)) {
      os_log_error(MotiSigNSELog(), "[motisig-nse] skip attach: disallowed mime=%{public}@ ext=%{public}@", fields[@"mime"] ?: @"", fields[@"ext"] ?: @"");
    }
  } else if ([ev isEqualToString:@"move_error"]) {
    if (MotiSigNSEShouldEmitConsole(1)) {
      os_log_error(MotiSigNSELog(), "[motisig-nse] moveItem failed: %{public}@", fields[@"error"] ?: @"");
    }
  } else if ([ev isEqualToString:@"attach_ok"]) {
    if (MotiSigNSEShouldEmitConsole(2)) {
      os_log(MotiSigNSELog(), "[motisig-nse] attached image typeHint=%{public}@", fields[@"typeHint"] ?: @"");
    }
  } else if ([ev isEqualToString:@"attach_error"]) {
    if (MotiSigNSEShouldEmitConsole(1)) {
      os_log_error(MotiSigNSELog(), "[motisig-nse] attachment failed: %{public}@", fields[@"error"] ?: @"");
    }
  } else if ([ev isEqualToString:@"time_will_expire"]) {
    if (MotiSigNSEShouldEmitConsole(1)) {
      os_log_error(MotiSigNSELog(), "[motisig-nse] serviceExtensionTimeWillExpire — delivering without attach if pending");
    }
  } else {
    if (MotiSigNSEShouldEmitConsole(3)) {
      os_log(MotiSigNSELog(), "[motisig-nse] event=%{public}@", ev ?: @"unknown");
    }
  }
}

- (void)motisig_deliverWithContentHandler:(void (^)(UNNotificationContent *_Nonnull))handler {
  void (^h)(UNNotificationContent *) = handler ?: self.contentHandler;
  if (!h) {
    return;
  }
  self.contentHandler = nil;

  NSMutableDictionary *mutInfo = [self.bestAttemptContent.userInfo mutableCopy];
  if (!mutInfo) {
    mutInfo = [NSMutableDictionary dictionary];
  }
  mutInfo[@"_motisigNseDebug"] = [self.motisigNseDebugEvents copy] ?: @[];
  self.bestAttemptContent.userInfo = mutInfo;

  h(self.bestAttemptContent);
}

- (void)didReceiveNotificationRequest:(UNNotificationRequest *)request withContentHandler:(void (^)(UNNotificationContent *_Nonnull))contentHandler {
  self.contentHandler = contentHandler;
  self.bestAttemptContent = [request.content mutableCopy];
  self.motisigNseDebugEvents = [NSMutableArray array];

  NSDictionary *userInfo = request.content.userInfo;
  id aps = userInfo[@"aps"];
  NSString *apsKeys = @"";
  id mutableContent = nil;
  if ([aps isKindOfClass:[NSDictionary class]]) {
    apsKeys = MotiSigSortedKeysSummary((NSDictionary *)aps);
    mutableContent = [(NSDictionary *)aps objectForKey:@"mutable-content"];
  }

  NSString *userKeys = MotiSigSortedKeysSummary(userInfo);
  [self motisig_nseDebugAppend:@{
    @"event" : @"entered",
    @"requestId" : request.identifier ?: @"",
    @"userInfoKeys" : userKeys,
    @"apsKeys" : apsKeys,
    @"mutableContent" : mutableContent ?: [NSNull null],
  }];

  NSString *urlString = [self motisig_imageURLStringFromUserInfo:userInfo];

  if (urlString.length == 0) {
    [self motisig_nseDebugAppend:@{ @"event" : @"no_url" }];
    [self motisig_deliverWithContentHandler:contentHandler];
    return;
  }

  NSURL *url = [NSURL URLWithString:urlString];
  NSString *scheme = url.scheme.lowercaseString;
  if (!url || (![scheme isEqualToString:@"http"] && ![scheme isEqualToString:@"https"])) {
    [self motisig_nseDebugAppend:@{ @"event" : @"bad_scheme", @"url" : urlString }];
    [self motisig_deliverWithContentHandler:contentHandler];
    return;
  }

  [self motisig_nseDebugAppend:@{ @"event" : @"download_start", @"url" : url.absoluteString ?: @"" }];

  [[[NSURLSession sharedSession]
    downloadTaskWithURL:url
      completionHandler:^(NSURL *_Nullable location, NSURLResponse *_Nullable response, NSError *_Nullable error) {
        if (!self.contentHandler) {
          return;
        }
        if (!location || error) {
          [self motisig_nseDebugAppend:@{
            @"event" : @"download_error",
            @"url" : url.absoluteString ?: @"",
            @"error" : error.localizedDescription ?: @"no location",
          }];
          [self motisig_deliverWithContentHandler:nil];
          return;
        }

        NSInteger status = 0;
        if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
          status = [(NSHTTPURLResponse *)response statusCode];
        }
        NSString *mime = MotiSigMimeTypeFromResponse(response);
        NSString *mimeLower = mime.lowercaseString;
        NSString *pathExt = url.pathExtension.lowercaseString;

        [self motisig_nseDebugAppend:@{
          @"event" : @"download_response",
          @"status" : @(status),
          @"mime" : mime,
          @"url" : url.absoluteString ?: @"",
        }];

        if (status != 200) {
          [self motisig_nseDebugAppend:@{ @"event" : @"reject_status", @"status" : @(status) }];
          [self motisig_deliverWithContentHandler:nil];
          return;
        }

        if (!MotiSigMimeAllowsImageAttach(mimeLower, pathExt)) {
          [self motisig_nseDebugAppend:@{ @"event" : @"reject_mime", @"mime" : mime, @"ext" : pathExt }];
          [self motisig_deliverWithContentHandler:nil];
          return;
        }

        NSString *typeHint = MotiSigTypeHintForImage(mimeLower, pathExt);
        NSString *ext = url.pathExtension.length > 0 ? url.pathExtension.lowercaseString : MotiSigFileExtensionForTypeHint(typeHint);

        NSString *fileName = [[[NSUUID UUID] UUIDString] stringByAppendingPathExtension:ext];
        NSString *destPath = [NSTemporaryDirectory() stringByAppendingPathComponent:fileName];
        NSURL *destURL = [NSURL fileURLWithPath:destPath];

        [[NSFileManager defaultManager] removeItemAtURL:destURL error:nil];
        NSError *moveError = nil;
        if (![[NSFileManager defaultManager] moveItemAtURL:location toURL:destURL error:&moveError]) {
          [self motisig_nseDebugAppend:@{ @"event" : @"move_error", @"error" : moveError.localizedDescription ?: @"" }];
          [self motisig_deliverWithContentHandler:nil];
          return;
        }

        NSDictionary *attachOptions = @{ UNNotificationAttachmentOptionsTypeHintKey : typeHint };
        NSError *attachError = nil;
        UNNotificationAttachment *attachment =
            [UNNotificationAttachment attachmentWithIdentifier:@"motisig-image"
                                                         URL:destURL
                                                     options:attachOptions
                                                       error:&attachError];
        if (attachment) {
          self.bestAttemptContent.attachments = @[ attachment ];
          [self motisig_nseDebugAppend:@{
            @"event" : @"attach_ok",
            @"typeHint" : typeHint,
            @"mime" : mime,
            @"destExt" : ext ?: @"",
          }];
        } else {
          [self motisig_nseDebugAppend:@{
            @"event" : @"attach_error",
            @"error" : attachError.localizedDescription ?: @"unknown",
            @"mime" : mime,
            @"typeHint" : typeHint,
          }];
        }
        [self motisig_deliverWithContentHandler:nil];
      }] resume];
}

/// Priority: `_motisig.imageUrl|image_url|image`, Expo relay `_richContent.image`, FCM `fcm_options.image`, flat keys.
/// Also recurses into `userInfo["body"]` (dict or JSON string) because Expo Push wraps
/// app-defined data under that key on iOS.
- (NSString *)motisig_imageURLStringFromUserInfo:(NSDictionary *)userInfo {
  NSString *url = [self motisig_imageURLFromContainer:userInfo];
  if (url.length > 0) {
    return url;
  }

  id body = userInfo[@"body"];
  if ([body isKindOfClass:[NSDictionary class]]) {
    url = [self motisig_imageURLFromContainer:(NSDictionary *)body];
    if (url.length > 0) {
      return url;
    }
  } else if ([body isKindOfClass:[NSString class]]) {
    NSData *data = [(NSString *)body dataUsingEncoding:NSUTF8StringEncoding];
    if (data) {
      id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      if ([parsed isKindOfClass:[NSDictionary class]]) {
        url = [self motisig_imageURLFromContainer:(NSDictionary *)parsed];
        if (url.length > 0) {
          return url;
        }
      }
    }
  }

  return nil;
}

- (NSString *)motisig_imageURLFromContainer:(NSDictionary *)container {
  if (![container isKindOfClass:[NSDictionary class]]) {
    return nil;
  }

  id ms = container[@"_motisig"];
  if ([ms isKindOfClass:[NSDictionary class]]) {
    for (NSString *k in @[ @"imageUrl", @"image_url", @"image" ]) {
      id img = [(NSDictionary *)ms objectForKey:k];
      if ([img isKindOfClass:[NSString class]] && [(NSString *)img length] > 0) {
        return (NSString *)img;
      }
    }
  }

  id rc = container[@"_richContent"];
  if ([rc isKindOfClass:[NSDictionary class]]) {
    id img = [(NSDictionary *)rc objectForKey:@"image"];
    if ([img isKindOfClass:[NSString class]] && [(NSString *)img length] > 0) {
      return (NSString *)img;
    }
  }

  id fcm = container[@"fcm_options"];
  if ([fcm isKindOfClass:[NSDictionary class]]) {
    id img = [(NSDictionary *)fcm objectForKey:@"image"];
    if ([img isKindOfClass:[NSString class]] && [(NSString *)img length] > 0) {
      return (NSString *)img;
    }
  }

  NSArray<NSString *> *keys = @[ @"image", @"imageUrl", @"image_url" ];
  for (NSString *k in keys) {
    id v = container[k];
    if ([v isKindOfClass:[NSString class]] && [(NSString *)v length] > 0) {
      return (NSString *)v;
    }
  }
  return nil;
}

- (void)serviceExtensionTimeWillExpire {
  if (!self.contentHandler) {
    return;
  }
  [self motisig_nseDebugAppend:@{ @"event" : @"time_will_expire" }];
  [self motisig_deliverWithContentHandler:nil];
}

@end
