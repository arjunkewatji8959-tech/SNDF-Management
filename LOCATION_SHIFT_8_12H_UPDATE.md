# Location Shift / Duty Hours Update

- Create Location में अब दो options हैं: **12 Hours Duty** और **8 Hours Duty**.
- Selected option के अनुसार Duty Hours स्वतः 12 Hours / 8 Hours दिखते हैं.
- Saved Locations में Shift और Duty Hours columns दिखते हैं.
- Staff की attendance check-in पर location से duty_hours automatically save होते हैं.
- **12 Hours Duty:** checkout 8 घंटे से कम होने पर Half Day लागू होता है.
- **8 Hours Duty:** existing Half Day rule लागू नहीं होता; attendance Present रहती है और actual worked hours save होते हैं.
- Day/Night shift और existing Night Shift Point Update/Web Push logic को सुरक्षित रखा गया है.
