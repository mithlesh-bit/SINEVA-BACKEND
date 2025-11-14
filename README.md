SINEVA Backend – AI Image Generation + OTP Auth + Cloudinary Upload API

This backend powers the SINEVA platform.
It provides:

AI Image Generation using Google Gemini

OTP-based user authentication

Cloudinary image uploading

User-specific image management

Everything is structured under /api/* routes with clean Express controllers.

Features
 OTP Authentication

Send OTP to email

Verify OTP for user login/verification

Secure with middleware

JWT-based session flow (if implemented in controller)

🎨 AI Image Generation (Gemini)

Create AI-generated images

Update generated images

Fetch user images

Fetch all public images

File upload handled via Multer (memory storage)

Base64 encoding → Cloudinary upload

Image Upload System

Upload normal images (not AI-generated)

Uses Cloudinary for storage

Accepts JPG, PNG, WEBP etc.

Returns secure URL directly

Tech Stack

Node.js

Express.js

MongoDB + Mongoose

Google Gemini API

Cloudinary

Multer

JWT Auth Middleware

dotenv