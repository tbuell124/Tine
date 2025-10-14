#ifdef RCT_NEW_ARCH_ENABLED

#import <React/RCTBridge+Private.h>
#import <ReactCommon/RCTTurboModule.h>
#import <ReactCommon/TurboModuleUtils.h>

#import "PitchDetector.h"

using namespace facebook;

namespace tine {
/**
 * Register the PitchDetector ObjC implementation as a TurboModule so it can be
 * resolved by the new architecture runtime.
 */
std::shared_ptr<react::TurboModule> ProvideTurboModule(
    const std::string &moduleName,
    const react::ObjCTurboModule::InitParams &params) {
  if (moduleName == "PitchDetector") {
    return std::make_shared<react::ObjCTurboModule>(params);
  }

  return nullptr;
}
} // namespace tine

std::shared_ptr<react::TurboModule> TineModuleProvider(
    const std::string &moduleName,
    const react::ObjCTurboModule::InitParams &params) {
  return tine::ProvideTurboModule(moduleName, params);
}
#endif
