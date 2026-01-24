import Foundation
import Combine

class JournalManager: ObservableObject {
    @Published var entries: [JournalEntry] = []

    private let saveKey = "WeeklyJournalEntries"

    init() {
        loadEntries()
    }

    func addEntry(_ entry: JournalEntry) {
        entries.insert(entry, at: 0) // Add to beginning for newest first
        saveEntries()
    }

    func updateEntry(_ entry: JournalEntry) {
        if let index = entries.firstIndex(where: { $0.id == entry.id }) {
            entries[index] = entry
            saveEntries()
        }
    }

    func deleteEntry(_ entry: JournalEntry) {
        entries.removeAll { $0.id == entry.id }
        saveEntries()
    }

    func hasEntryThisWeek() -> Bool {
        let calendar = Calendar.current
        let now = Date()

        return entries.contains { entry in
            calendar.isDate(entry.date, equalTo: now, toGranularity: .weekOfYear)
        }
    }

    private func saveEntries() {
        if let encoded = try? JSONEncoder().encode(entries) {
            UserDefaults.standard.set(encoded, forKey: saveKey)
        }
    }

    private func loadEntries() {
        if let data = UserDefaults.standard.data(forKey: saveKey),
           let decoded = try? JSONDecoder().decode([JournalEntry].self, from: data) {
            entries = decoded
        }
    }
}
