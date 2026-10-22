MediLink for clinics
====================

START
  Windows : open the MediLink folder and double-click MediLink.exe.
            If Windows SmartScreen appears, choose "More info" then "Run anyway".
  macOS   : open the MediLink folder, right-click MediLink and choose Open,
            then Open again. (Needed once, because this trial build is not yet
            signed by Apple.)
  Linux   : run ./MediLink inside the MediLink folder.

A window opens showing the clinic's address, and your browser opens MediLink.
Keep that window open while the clinic is working. Close it to stop.

FIRST RUN
  The browser shows a short set-up: your clinic's name and the first
  administrator account. Then add your doctors, reception and pharmacy staff
  under "Clinic and staff", and your logo, colour and fee under
  "Clinic settings".

OTHER DEVICES (kiosk tablet, doctor's room, pharmacy)
  Use the "Other devices" address shown in the MediLink window, on the same
  Wi-Fi. Add /kiosk for the check-in kiosk and /board for a waiting-room TV.

CLOUD BACKUP (optional)
  Clinic settings → Cloud backup shows your Clinic ID. Send it to HarNova,
  paste the cloud key you receive, and press Connect to cloud.

YOUR DATA
  Records are kept on this computer in:
    Windows : %LOCALAPPDATA%\MediLink
    macOS   : ~/Library/Application Support/MediLink
    Linux   : ~/.local/share/medilink
  Back up that whole folder, including keys.json. Without keys.json the
  identity card numbers stored in it cannot be read.

Help and updates: https://medilink.harnova.my
