const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const NodeID3 = require("node-id3"); // Import node-id3

const router = express.Router();
const audioDirectory = path.join(__dirname, "../audio");

router.use(express.json());

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, audioDirectory);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

// CREATE: Upload a new MP3 file
router.post("/", upload.single("mp3"), (req, res) => {
  res.status(201).json({ message: "MP3 uploaded successfully", file: req.file });
});

// READ: List all MP3 files
router.get("/", (req, res) => {
  fs.readdir(audioDirectory, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Unable to list files" });
    }

    const filteredFiles = files.filter(
      (file) => path.extname(file) === ".mp3" || path.extname(file) === ".wav"
    );

    console.log("Files being sent:", filteredFiles); // Log the array of files

    res.json(filteredFiles);
  });
});

// READ: Get Metadata of an Audio file
router.get("/:filename/metadata", async (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);
  try {
    const { parseFile } = await import("music-metadata"); // Dynamic import
    const metadata = await parseFile(filePath);

    // Extract required fields and custom tags
    const result = {
      title: metadata.common.title || '',
      artist: metadata.common.artist || '',
      bpm: metadata.common.bpm || '',
      duration: metadata.format.duration || 0,
      tags: metadata.common // Extract all custom tags, if any
    };

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Unable to read metadata", details: err.message });
  }
});

// READ: Serve Audio File for Playback
router.get("/audio/:filename", (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);

  if (fs.existsSync(filePath)) {
    const extname = path.extname(filePath).toLowerCase();
    let contentType = 'audio/mpeg'; // Default to MP3 MIME type

    if (extname === '.wav') {
      contentType = 'audio/wav';
    }

    res.setHeader("Content-Type", contentType);
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// UPDATE: Edit Metadata of an Audio file (MP3)
router.put("/:filename/metadata", (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);
  const tags = req.body;

  console.log("Received tags for update:", tags);

  // Validate and construct ID3 tags
  const id3Tags = {
    title: tags.title || '',
    artist: tags.artist || '',
    bpm: tags.bpm || '',
    // Add custom tags
    'TXXX:CustomTag1': tags.customTag1 || '',
    'TXXX:CustomTag2': tags.customTag2 || ''
  };

  NodeID3.update(id3Tags, filePath, (err) => {
    if (err) {
      console.error("Error updating metadata:", err);
      return res.status(500).json({ error: "Unable to edit metadata", details: err.message });
    }
    res.json({ message: "Metadata updated successfully" });
  });
});

// DELETE: Delete an MP3 file
router.delete("/:filename", (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: "Unable to delete file" });
    }
    res.json({ message: "MP3 deleted successfully" });
  });
});

// UPDATE: Replace original with edited audio file
router.post("/replace", (req, res) => {
  const { originalFilePath } = req.body;
  const editedFile = req.file;

  if (!editedFile || !originalFilePath) {
    return res.status(400).json({ message: "Original file path and edited file are required" });
  }

  const originalFilePathFull = path.join(audioDirectory, originalFilePath);
  const editedFilePathFull = path.join(audioDirectory, editedFile.filename);

  // Replace the original file with the edited file
  fs.rename(editedFilePathFull, originalFilePathFull, (err) => {
    if (err) {
      return res.status(500).json({ message: "Error replacing file", err });
    }

    res
      .status(200)
      .json({
        message: "File replaced successfully",
        filePath: originalFilePathFull,
      });
  });
});

module.exports = router;

