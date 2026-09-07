# SNDF MANAGEMENT — Photo Included Profile PDF

- Profile View now has a real PDF download endpoint: `/api/staff/:id/profile-pdf`.
- PDF contains staff details plus the four full-body photos (Front, Back, Left, Right) when submitted.
- The download is a `.pdf`, not CSV.
- Only Admin and Master Admin can download profiles.
- Added `pdfkit` dependency; run `npm install` after extracting the project.
