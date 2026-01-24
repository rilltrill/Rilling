import SwiftUI

struct PastEntriesView: View {
    @EnvironmentObject var journalManager: JournalManager
    @State private var selectedEntry: JournalEntry?

    var body: some View {
        HStack(spacing: 0) {
            // Sidebar with entry list
            VStack(alignment: .leading, spacing: 0) {
                Text("Your Entries")
                    .font(.headline)
                    .padding()

                Divider()

                if journalManager.entries.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "book.closed")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary)
                        Text("No entries yet")
                            .foregroundColor(.secondary)
                        Text("Start your weekly journal!")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(journalManager.entries) { entry in
                                EntryListItem(
                                    entry: entry,
                                    isSelected: selectedEntry?.id == entry.id
                                )
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    selectedEntry = entry
                                }

                                Divider()
                            }
                        }
                    }
                }
            }
            .frame(width: 280)
            .background(Color(NSColor.controlBackgroundColor))

            Divider()

            // Detail view
            if let entry = selectedEntry {
                EntryDetailView(entry: entry)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "arrow.left")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    Text("Select an entry to view")
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .onAppear {
            if selectedEntry == nil, let firstEntry = journalManager.entries.first {
                selectedEntry = firstEntry
            }
        }
        .onChange(of: journalManager.entries) { newEntries in
            // Update selected entry if it was deleted
            if let selected = selectedEntry,
               !newEntries.contains(where: { $0.id == selected.id }) {
                selectedEntry = newEntries.first
            }
        }
    }
}

struct EntryListItem: View {
    let entry: JournalEntry
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.weekNumber)
                .font(.caption)
                .foregroundColor(.secondary)

            Text(entry.formattedDate)
                .font(.subheadline)
                .fontWeight(.medium)

            Text(entry.content)
                .font(.caption)
                .foregroundColor(.secondary)
                .lineLimit(2)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isSelected ? Color.accentColor.opacity(0.15) : Color.clear)
    }
}

struct EntryDetailView: View {
    @EnvironmentObject var journalManager: JournalManager
    let entry: JournalEntry
    @State private var isEditing = false
    @State private var editedText: String
    @State private var showDeleteConfirmation = false

    init(entry: JournalEntry) {
        self.entry = entry
        _editedText = State(initialValue: entry.content)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.weekNumber)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Text(entry.formattedDate)
                        .font(.title3)
                        .fontWeight(.semibold)
                }

                Spacer()

                if !isEditing {
                    Button(action: { isEditing = true }) {
                        Image(systemName: "pencil")
                    }
                    .buttonStyle(.borderless)

                    Button(action: { showDeleteConfirmation = true }) {
                        Image(systemName: "trash")
                            .foregroundColor(.red)
                    }
                    .buttonStyle(.borderless)
                } else {
                    Button("Cancel") {
                        isEditing = false
                        editedText = entry.content
                    }
                    .buttonStyle(.borderless)

                    Button("Save") {
                        saveChanges()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(editedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }

            Divider()

            // Content
            if isEditing {
                TextEditor(text: $editedText)
                    .font(.body)
                    .scrollContentBackground(.hidden)
                    .background(Color(NSColor.textBackgroundColor))
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                    )
            } else {
                ScrollView {
                    Text(entry.content)
                        .font(.body)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding()
        .alert("Delete Entry", isPresented: $showDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                journalManager.deleteEntry(entry)
            }
        } message: {
            Text("Are you sure you want to delete this journal entry? This action cannot be undone.")
        }
    }

    private func saveChanges() {
        var updatedEntry = entry
        updatedEntry.content = editedText.trimmingCharacters(in: .whitespacesAndNewlines)
        journalManager.updateEntry(updatedEntry)
        isEditing = false
    }
}
