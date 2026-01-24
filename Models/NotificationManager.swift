import Foundation
import UserNotifications

class NotificationManager {
    static let shared = NotificationManager()

    private init() {}

    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                print("Notification permission granted")
            } else if let error = error {
                print("Notification permission error: \(error.localizedDescription)")
            }
        }
    }

    func scheduleWeeklyReminder() {
        let center = UNUserNotificationCenter.current()

        // Remove existing notifications
        center.removeAllPendingNotificationRequests()

        // Create notification content
        let content = UNMutableNotificationContent()
        content.title = "Weekly Journal"
        content.body = "Time to reflect! What's one thing that happened in your life this week?"
        content.sound = .default

        // Schedule for every Sunday at 6 PM
        var dateComponents = DateComponents()
        dateComponents.weekday = 1 // Sunday
        dateComponents.hour = 18
        dateComponents.minute = 0

        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)

        let request = UNNotificationRequest(
            identifier: "weeklyJournalReminder",
            content: content,
            trigger: trigger
        )

        center.add(request) { error in
            if let error = error {
                print("Error scheduling notification: \(error.localizedDescription)")
            } else {
                print("Weekly reminder scheduled successfully")
            }
        }
    }
}
