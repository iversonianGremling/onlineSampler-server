const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const NodeID3 = require("node-id3"); // For MP3 files
const WavEncoder = require("wav-encoder"); // For encoding WAV files

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

// CREATE: Upload a new Audio file
router.post("/", upload.single("mp3"), (req, res) => {
  res
    .status(201)
    .json({ message: "Audio uploaded successfully", file: req.file });
});

// READ: List all Audio files
router.get("/", (req, res) => {
  fs.readdir(audioDirectory, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Unable to list files" });
    }

    const filteredFiles = files.filter(
      (file) => path.extname(file) === ".mp3" || path.extname(file) === ".wav"
    );

    console.log("Files being sent:", filteredFiles);

    res.json(filteredFiles);
  });
});

// Serve audio files
router.get("/:filename", (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);

  // Check if the file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ error: "File not found" });
    }

    // Serve the file
    res.sendFile(filePath);
  });
});

// READ: Get Metadata of an Audio file
router.get("/:filename/metadata", async (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);

  const { parseFile } = await import("music-metadata"); // For reading metadata
  try {
    const metadata = await parseFile(filePath);

    // Extract required fields and custom tags
    const result = {
      title: metadata.common.title || "",
      artist: metadata.common.artist || "",
      bpm: metadata.common.bpm || "",
      duration: metadata.format.duration || 0,
      tags: metadata.common,
    };

    res.json(result);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Unable to read metadata", details: err.message });
  }
});

// UPDATE: Edit Metadata of an Audio file
router.put("/:filename/metadata", async (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);
  const tags = req.body;
  const extname = path.extname(filePath).toLowerCase();

  if (extname === ".mp3") {
    // Handle MP3 metadata
    const id3Tags = {
      title: tags.title || "",
      artist: tags.artist || "",
      bpm: tags.bpm || "",
      "TXXX:CustomTag1": tags.customTag1 || "",
      "TXXX:CustomTag2": tags.customTag2 || "",
    };

    NodeID3.update(id3Tags, filePath, (err) => {
      if (err) {
        console.error("Error updating metadata:", err);
        return res
          .status(500)
          .json({ error: "Unable to edit metadata", details: err.message });
      }
      res.json({ message: "Metadata updated successfully" });
    });
  } else if (extname === ".wav") {
    // Handle WAV metadata
    try {
      const { parseFile } = await import("music-metadata"); // For reading metadata
      const metadata = await parseFile(filePath);
      // Update the metadata (WAV format)
      metadata.common.title = tags.title || metadata.common.title || "";
      metadata.common.artist = tags.artist || metadata.common.artist || "";
      metadata.common.bpm = tags.bpm || metadata.common.bpm || "";

      // Encode the new metadata into the WAV file
      const buffer = await WavEncoder.encode({
        sampleRate: metadata.format.sampleRate,
        channelData: metadata.format.channelData,
      });

      fs.writeFileSync(filePath, Buffer.from(buffer));

      res.json({ message: "Metadata updated successfully" });
    } catch (err) {
      console.error("Error updating WAV metadata:", err);
      res
        .status(500)
        .json({ error: "Unable to edit WAV metadata", details: err.message });
    }
  } else {
    res.status(400).json({ error: "Unsupported file format" });
  }
});

// DELETE: Delete an Audio file
router.delete("/:filename", (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: "Unable to delete file" });
    }
    res.json({ message: "Audio deleted successfully" });
  });
});

// UPDATE: Replace original with edited audio file
router.post("/replace", upload.single("mp3"), (req, res) => {
  const { originalFilePath } = req.body;
  const editedFile = req.file;

  if (!editedFile || !originalFilePath) {
    return res
      .status(400)
      .json({ message: "Original file path and edited file are required" });
  }

  const originalFilePathFull = path.join(audioDirectory, originalFilePath);
  const editedFilePathFull = path.join(audioDirectory, editedFile.filename);

  fs.rename(editedFilePathFull, originalFilePathFull, (err) => {
    if (err) {
      return res.status(500).json({ message: "Error replacing file", err });
    }

    res.status(200).json({
      message: "File replaced successfully",
      filePath: originalFilePathFull,
    });
  });
});

module.exports = router;
