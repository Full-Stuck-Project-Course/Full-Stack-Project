// middleware/upload.js

const multer = require("multer");
const path   = require("path");
const crypto = require("crypto");

const Upload = require("../db/models/Upload");

// Files are held in memory and persisted to MongoDB by saveUpload; the hosting
// tier has no permanent disk, so nothing is ever written to the filesystem.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowed = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp"
    };
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed[ext] && allowed[ext] === file.mimetype) cb(null, true);
    else cb(new Error("Only image files allowed (jpg, png, webp)"), false);
};

function isValidImageFile(file) {
    const buffer = file?.buffer;
    if (!Buffer.isBuffer(buffer)) return false;
    if (buffer.length < 12) return false;

    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = buffer.slice(0, 4).toString("ascii") === "RIFF" &&
        buffer.slice(8, 12).toString("ascii") === "WEBP";

    if (file.mimetype === "image/jpeg") return isJpeg;
    if (file.mimetype === "image/png") return isPng;
    if (file.mimetype === "image/webp") return isWebp;
    return false;
}

// Persists an in-memory upload and returns the same logical path shape the rest
// of the app already stores, so the frontend needs no changes.
async function saveUpload(file, kind, userId = null) {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;

    await Upload.create({
        kind,
        filename,
        mimeType: file.mimetype,
        size: file.size,
        data: file.buffer,
        uploadedBy: userId
    });

    return { storedPath: `/uploads/${kind}/${filename}` };
}

// Kept for the controllers that still call it; nothing exists on disk to delete.
function cleanupFile() {}

const upload = multer({ storage, fileFilter, limits: { fileSize: 15 * 1024 * 1024 } });

upload.isValidImageFile = isValidImageFile;
upload.cleanupFile = cleanupFile;
upload.saveUpload = saveUpload;

module.exports = upload;
