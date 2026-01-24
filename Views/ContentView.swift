import SwiftUI

struct ContentView: View {
    @EnvironmentObject var journalManager: JournalManager
    @State private var selectedTab = 0

    var body: some View {
        VStack(spacing: 0) {
            // Custom header
            HStack {
                Text("📔 Weekly Journal")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.primary)

                Spacer()

                if journalManager.hasEntryThisWeek() {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Entry recorded this week")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding()
            .background(Color(NSColor.windowBackgroundColor))

            Divider()

            // Tab selection
            Picker("", selection: $selectedTab) {
                Text("New Entry").tag(0)
                Text("Past Entries").tag(1)
            }
            .pickerStyle(.segmented)
            .padding()

            // Content based on selected tab
            if selectedTab == 0 {
                NewEntryView()
            } else {
                PastEntriesView()
            }
        }
    }
}
