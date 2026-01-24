import SwiftUI

struct NewEntryView: View {
    @EnvironmentObject var journalManager: JournalManager
    @State private var entryText: String = ""
    @State private var showSuccessMessage = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Text("What's one thing that happened this week?")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text(Date().formatted(date: .long, time: .omitted))
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.top, 20)

            // Text editor
            ZStack(alignment: .topLeading) {
                if entryText.isEmpty {
                    Text("Share your thoughts here...")
                        .foregroundColor(.secondary.opacity(0.5))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 12)
                }

                TextEditor(text: $entryText)
                    .font(.body)
                    .scrollContentBackground(.hidden)
                    .background(Color(NSColor.textBackgroundColor))
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                    )
            }
            .frame(maxHeight: .infinity)

            // Save button
            HStack {
                Spacer()

                if showSuccessMessage {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Entry saved!")
                            .foregroundColor(.green)
                    }
                    .transition(.opacity)
                }

                Button(action: saveEntry) {
                    HStack {
                        Image(systemName: "square.and.arrow.down")
                        Text("Save Entry")
                    }
                    .frame(width: 140)
                }
                .buttonStyle(.borderedProminent)
                .disabled(entryText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding()
    }

    private func saveEntry() {
        let trimmedText = entryText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        let newEntry = JournalEntry(content: trimmedText)
        journalManager.addEntry(newEntry)

        // Clear the text field
        entryText = ""

        // Show success message
        withAnimation {
            showSuccessMessage = true
        }

        // Hide success message after 2 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            withAnimation {
                showSuccessMessage = false
            }
        }
    }
}
