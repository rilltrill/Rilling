import Foundation

struct JournalEntry: Identifiable, Codable, Equatable {
    let id: UUID
    let date: Date
    var content: String

    init(id: UUID = UUID(), date: Date = Date(), content: String) {
        self.id = id
        self.date = date
        self.content = content
    }

    var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    var weekNumber: String {
        let calendar = Calendar.current
        let weekOfYear = calendar.component(.weekOfYear, from: date)
        let year = calendar.component(.year, from: date)
        return "Week \(weekOfYear), \(year)"
    }
}
