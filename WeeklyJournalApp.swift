import SwiftUI

@main
struct WeeklyJournalApp: App {
    @StateObject private var journalManager = JournalManager()

    init() {
        // Request notification permissions on launch
        NotificationManager.shared.requestPermission()
        NotificationManager.shared.scheduleWeeklyReminder()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(journalManager)
                .frame(minWidth: 600, minHeight: 500)
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}
