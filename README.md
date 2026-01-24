# 📔 Weekly Journal - macOS App

A beautiful and simple macOS application that helps you reflect on your life by prompting you to write down one thing that happened each week.

## Features

- **Clean, Native macOS Interface**: Built with SwiftUI for a modern, native macOS experience
- **Weekly Reminders**: Automatic notifications every Sunday at 6 PM to remind you to journal
- **Simple & Focused**: Write just one thing - keep it simple and sustainable
- **Browse Past Entries**: View, edit, and manage all your past journal entries
- **Local Storage**: All your entries are stored securely on your Mac using UserDefaults
- **Week Tracking**: See which week you wrote each entry with automatic date formatting

## Screenshots

The app features two main views:
- **New Entry**: Write your weekly reflection in a clean, distraction-free interface
- **Past Entries**: Browse and manage your journal history with a sidebar/detail layout

## How to Build

### Requirements
- macOS 12.0 or later
- Xcode 13.0 or later
- Swift 5.5 or later

### Build Instructions

1. **Create a new Xcode project:**
   - Open Xcode
   - File → New → Project
   - Select macOS → App
   - Product Name: `WeeklyJournal`
   - Interface: SwiftUI
   - Language: Swift
   - Leave "Use Core Data" and "Include Tests" unchecked

2. **Add the source files:**
   - Replace the default `WeeklyJournalApp.swift` with the one from this repository
   - Delete the default `ContentView.swift`
   - Create a `Models` folder and add:
     - `JournalEntry.swift`
     - `JournalManager.swift`
     - `NotificationManager.swift`
   - Create a `Views` folder and add:
     - `ContentView.swift`
     - `NewEntryView.swift`
     - `PastEntriesView.swift`

3. **Configure the project:**
   - Select your project in the navigator
   - Go to "Signing & Capabilities"
   - Add your development team
   - Make sure "App Sandbox" is enabled
   - Replace `Info.plist` with the one from this repository
   - Add `WeeklyJournal.entitlements` to your project

4. **Enable notifications:**
   - In Xcode, go to project settings → Signing & Capabilities
   - The notification permissions are already requested in code
   - Ensure the Info.plist includes `NSUserNotificationsUsageDescription`

5. **Build and run:**
   - Press ⌘+R or click the Run button
   - Grant notification permissions when prompted
   - Start journaling!

## Usage

### First Launch
1. When you first launch the app, it will request permission to send notifications
2. Click "Allow" to receive weekly reminders

### Writing an Entry
1. Select the "New Entry" tab
2. Type your reflection in the text box
3. Click "Save Entry" when done
4. The entry is automatically saved with the current date

### Viewing Past Entries
1. Select the "Past Entries" tab
2. Click on any entry in the sidebar to view it
3. Use the edit button (pencil icon) to modify an entry
4. Use the delete button (trash icon) to remove an entry

### Weekly Reminders
- The app sends a notification every Sunday at 6:00 PM
- This reminds you to reflect on your week and write your entry
- You can write entries at any time, not just when reminded

## Privacy

All your journal entries are stored locally on your Mac. Nothing is sent to any server or shared with anyone. Your thoughts and reflections remain completely private.

## Customization

You can customize various aspects by modifying the code:
- **Notification time**: Edit `NotificationManager.swift` to change the day/time
- **UI colors**: Modify the SwiftUI views to adjust colors and styling
- **Storage**: Currently uses UserDefaults, but can be changed to file-based storage or Core Data

## Technical Details

- **Framework**: SwiftUI
- **Storage**: UserDefaults (JSON encoding)
- **Notifications**: UserNotifications framework
- **Architecture**: MVVM pattern with ObservableObject
- **Minimum macOS**: 12.0

## License

This project is open source and available for personal use and modification.

---

Made with ❤️ for weekly reflection and personal growth
