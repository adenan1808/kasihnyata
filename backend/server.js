const express = require('express');
const multer = require('multer');
const cors = require('cors');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(cors());

const UPLOADS_DIR = path.join(__dirname, 'uploads', 'products');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve static files from uploads
app.use('/uploads/products', express.static(UPLOADS_DIR));

// Configure multer
const storage = multer.memoryStorage();
// Add file size limit to prevent DoS via large uploads (e.g. 5MB)
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No image uploaded' });
  }

  if (!req.file.mimetype.startsWith('image/')) {
    return res.status(400).json({ success: false, error: 'Invalid file type. Only images are allowed.' });
  }

  try {
    const uuid = crypto.randomBytes(16).toString('hex');
    const baseFilename = `prod_${uuid}`;

    const mediumFilename = `${baseFilename}_medium.webp`;
    const mediumPath = path.join(UPLOADS_DIR, mediumFilename);

    const thumbFilename = `${baseFilename}_thumb.webp`;
    const thumbPath = path.join(UPLOADS_DIR, thumbFilename);

    await sharp(req.file.buffer)
      .resize({ width: 300, height: 300, fit: 'inside' })
      .webp({ quality: 80 })
      .toFile(mediumPath);

    await sharp(req.file.buffer)
      .resize({ width: 64, height: 64, fit: 'cover' })
      .webp({ quality: 60 })
      .toFile(thumbPath);

    res.json({
      success: true,
      image_url: `http://localhost:3000/uploads/products/${mediumFilename}`,
      thumbnail_url: `http://localhost:3000/uploads/products/${thumbFilename}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.toString() });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
