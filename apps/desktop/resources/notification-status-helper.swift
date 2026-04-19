import Foundation
import UserNotifications

let helperStatusEnv = "PI_APP_TEST_NOTIFICATION_PERMISSION_HELPER_STATUS"

struct HelperOutput: Encodable {
    let status: String
}

func normalizeStatus(_ value: String?) -> String? {
    switch value {
    case "granted", "denied", "default", "unsupported", "unknown":
        return value
    default:
        return nil
    }
}

func mapAuthorizationStatus(_ value: UNAuthorizationStatus) -> String {
    switch value {
    case .notDetermined:
        return "default"
    case .denied:
        return "denied"
    case .authorized, .provisional, .ephemeral:
        return "granted"
    @unknown default:
        return "unknown"
    }
}

func emit(_ output: HelperOutput) -> Never {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try! encoder.encode(output)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
    exit(EXIT_SUCCESS)
}

if let overrideStatus = normalizeStatus(ProcessInfo.processInfo.environment[helperStatusEnv]) {
    emit(HelperOutput(status: overrideStatus))
}

let semaphore = DispatchSemaphore(value: 0)
var resolvedOutput = HelperOutput(status: "unknown")

UNUserNotificationCenter.current().getNotificationSettings { settings in
    resolvedOutput = HelperOutput(status: mapAuthorizationStatus(settings.authorizationStatus))
    semaphore.signal()
}

_ = semaphore.wait(timeout: .now() + .seconds(5))
emit(resolvedOutput)
