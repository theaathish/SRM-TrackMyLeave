# TrackMyLeave - Project Codebase Analysis

## Project Overview
The **TrackMyLeave** project is a robust React Native application built on the **Expo framework (SDK 53)**, utilizing **Firebase** for backend services including Authentication, Firestore Database, and Cloud Messaging (FCM). It is designed to manage leave requests, permissions, and on-duty status for staff, integrating university-specific calendar logic.

## Architectural Overview
- **Framework**: React Native with **Expo Router** for file-based navigation.
- **State & Security**: A custom `AppStateManager` handles biometric locking and app lifecycle events, persisting security state via `SecureStore`.
- **Backend**: **Firebase Firestore** serves as the primary NoSQL database. **Firebase Auth** handles user identity with specific roles (Staff, Director, SubAdmin).
- **Notifications**: Integrated FCM using `@react-native-firebase/messaging` and `expo-notifications`. Custom token management is handled in `lib/notificationTokenManager.ts`.
- **Styling**: **NativeWind (Tailwind CSS)** is used for consistent, utility-first UI design.

## Key Features & Business Logic
- **Leave Management**: Supports multiple request types (Leave, Permission, On Duty, Compensation) with automated notification triggers for Directors.
- **Holiday Engine**: A sophisticated calendar system located in `lib/holidays.ts`. It calculates working days by accounting for:
  - National holidays
  - SRM-specific Foundation Day
  - Dynamic 'Working Saturdays' stored in Firestore.
- **Security**: Mandatory biometric/PIN authentication for app access, managed globally at the root layout level.

## Project Structure
- **`app/`**: Contains the application navigation routes.
  - `(tabs)`: Main feature tabs (Home, Holidays, Profile, Staff, Submit).
  - `auth`: Authentication and onboarding screens.
- **`lib/`**: Houses the service layer and business logic.
  - `firestore.ts`: Database interactions.
  - `auth.ts`: Authentication routines.
  - `notifications.ts` & `notificationTokenManager.ts`: FCM logic.
- **`components/`**: Modular UI components.
  - `ui/`: Generic reusable elements (Buttons, Cards, Inputs).
  - `holidays/`: Feature-specific components.
- **`scripts/`**: Utilities for deployment and data management (e.g., campus mapping).

## Key Components & Relevant Locations

| File Path | Description | Key Symbols / Functions |
| :--- | :--- | :--- |
| **`lib/appStateManager.ts`** | Centralized manager for app security, biometrics, and lifecycle state. | `AppStateManager`, `lockApp`, `authenticate` |
| **`lib/firestore.ts`** | Core business logic for leave processing and Firestore interactions. | `createLeaveRequest`, `updateLeaveRequestStatus`, `getWorkingSaturdays` |
| **`lib/auth.ts`** | Handles Firebase authentication and user profile data management. | `signIn`, `signUp`, `User` |
| **`lib/holidays.ts`** | Implements complex calendar logic for university-specific holidays and working Saturdays. | `isWorkingDay`, `getHolidays`, `validateLeaveRequest` |
| **`app/index.tsx`** | Application entry point handling initial routing and notification-based deep linking. | `IndexScreen`, `handleNotificationResponse` |

## Exploration Trace
The analysis followed this path:
1.  **`package.json`**: Identified core dependencies (Expo, Firebase, NativeWind).
2.  **`app.json`**: Checked Expo configuration and plugins.
3.  **`app/_layout.tsx` & `lib/appStateManager.ts`**: Understood security and biometric locking mechanisms.
4.  **`lib/auth.ts`**: Reviewed authentication flow.
5.  **`lib/firestore.ts`**: Analyzed data model for leaves and working days.
6.  **`lib/notificationTokenManager.ts`**: Verified FCM notification implementation.
7.  **`lib/holidays.ts`**: Investigated calendar and working day calculation logic.
8.  **`app/`**: Mapped the navigation structure.
