Apply campus mapping from CSV

This script helps update Firestore `users` documents to set the `campus` field based on an input CSV.

Usage

1. Install dependencies (if not present):
   npm install firebase-admin

2. Prepare a CSV with header `email,campus` where campus is `TRP` or `RMP`.
   Example: `scripts/sample_campus_map.csv`

3. Run the script (dry-run to preview):
   node ./scripts/apply_campus_mapping.js --csv ./scripts/sample_campus_map.csv --serviceAccount ./path/to/serviceAccount.json

   By default the script runs in dry-run mode and will only print planned changes. To apply updates pass `--update`:

   node ./scripts/apply_campus_mapping.js --csv ./scripts/sample_campus_map.csv --serviceAccount ./path/to/serviceAccount.json --update

Flags

--csv <path>           Path to CSV file (required)
--serviceAccount <path>   Path to Firebase service account JSON (optional if GOOGLE_APPLICATION_CREDENTIALS is set)
--mode <csv|trp-default-rmp>  Mode to run the script. `csv` (default) will only process the CSV mappings. `trp-default-rmp` will set CSV-listed emails to TRP and set RMP for all other non-Director users who are missing campus.
--dry-run              Run without performing writes (default if --update not provided)
--update               Perform updates in Firestore

Notes
- The script matches users by exact `email` field in Firestore (case-insensitive in the CSV parsing step).
- Only campus values `TRP` and `RMP` are accepted.
- The script will set `updatedAt` to server timestamp when updating.

Safety
- The script will not perform writes unless `--update` is provided.
- Always run a dry-run first and inspect the planned changes.
