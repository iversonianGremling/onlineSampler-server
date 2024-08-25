//audio.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const NodeID3 = require("node-id3"); // For MP3 files
const WavEncoder = require("wav-encoder"); // For encoding WAV files
const util = require("util");

const router = express.Router();
const audioDirectory = path.join(__dirname, "../audio");
const readFile = util.promisify(fs.readFile);

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

  // Create customTags json file
  fs.writeFile(req.file.path + ".json", "{}", (err) => {
    if (err) {
      console.error("Error creating customTags file: ", err);
      return;
    }
  });
});

// READ: List all Audio files
router.get("/", async (req, res) => {
  fs.readdir(audioDirectory, async (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Unable to list files" });
    }

    const filteredFiles = files.filter(
      (file) => path.extname(file) === ".mp3" || path.extname(file) === ".wav"
    );

    // Pair audio files with their respective JSON files
    const filesWithTags = await Promise.all(
      filteredFiles.map(async (file) => {
        const jsonFilePath = path.join(
          audioDirectory,
          `${path.basename(file, path.extname(file))}.json`
        );

        let customTags = [];
        try {
          // Check if the customTags file exists and if not create it
          try {
            await fs.promises.access(jsonFilePath, fs.constants.F_OK);
          } catch (err) {
            await fs.promises.writeFile(jsonFilePath, `{"customTags": ""}`);
          }

          const data = await fs.promises.readFile(jsonFilePath, "utf8");
          customTags = JSON.parse(data).customTags || [];
          customTags =
            typeof customTags === "string" || customTags instanceof String
              ? customTags.split(",")
              : [];
        } catch (err) {
          console.error(`Failed to read JSON file for ${file}:`, err);
        }

        return { file, customTags };
      })
    );

    console.log("Files being sent:", filesWithTags);

    res.json(filesWithTags);
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
  const extname = path.extname(filePath).toLowerCase();

  const { parseFile } = await import("music-metadata"); // For reading metadata
  try {
    const metadata = await parseFile(filePath);

    // Check if the customTags file exists and if not create it
    try {
      await fs.promises.access(`${filePath}${extname}.json`, fs.constants.F_OK);
    } catch (err) {
      await fs.promises.writeFile(`${filePath}${extname}.json`, `{"tags": ""}`);
    }

    // Read customTags file
    let customTags = [];
    try {
      const data = await fs.promises.readFile(
        `${filePath}${extname}.json`,
        "utf8"
      );
      console.log(`Reading customTags file: ${filePath}${extname}.json`);
      console.log(`Contents of customTags file: ${JSON.parse(data).tags}`);
      customTags = JSON.parse(data).tags || [];
      console.log("Read customTags: ", customTags);
    } catch (err) {
      console.error("Error reading customTags file: ", err);
    }

    // Extract required fields and add custom tags
    const result = {
      title: metadata.common.title || "",
      artist: metadata.common.artist || "",
      bpm: metadata.common.bpm || "",
      duration: metadata.format.duration || 0,
      tags: customTags || [],
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
  const extname = path.extname(filePath).toLowerCase();
  const metadata = req.body;
  console.log("Received metadata: ", metadata);
  console.log("Received metadata title: ", metadata.title ? "yes" : "no");
  let customTags = req.body.tags;

  console.log("Received customTags: ", customTags);

  if (extname === ".mp3") {
    // Handle MP3 metadata
    const id3Tags = {
      title: metadata.title || "",
      artist: metadata.artist || "",
      bpm: metadata.bpm || "",
    };

    customTags =
      typeof customTags === "string" || customTags instanceof String
        ? customTags.split(",")
        : [];

    console.log(id3Tags);

    if (metadata.title === "") {
      delete id3Tags.title;
    }
    if (metadata.artist === "") {
      delete id3Tags.artist;
    }
    if (metadata.bpm === "") {
      delete id3Tags.bpm;
    }

    const updateId3Tags = new Promise((resolve, reject) => {
      NodeID3.update(id3Tags, filePath, (err) => {
        if (err) {
          console.error("Error updating metadata:", err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    const writeCustomTags = new Promise((resolve, reject) => {
      fs.writeFile(
        `${filePath}${extname}.json`,
        JSON.stringify({ tags: customTags }),
        (err) => {
          if (err) {
            console.error(err);
            reject(err);
          } else {
            console.log("File has been saved!");
            resolve();
          }
        }
      );
    });

    Promise.all([updateId3Tags, writeCustomTags])
      .then(() => {
        res.json({ message: "Metadata updated successfully" });
      })
      .catch((err) => {
        res
          .status(500)
          .json({ error: "Unable to edit metadata", details: err.message });
      });
  } else {
    res.status(400).json({ error: "Unsupported file format" });
  }
});

// DELETE: Delete an Audio file
router.delete("/:filename", (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: "Unable to delete audio file" });
    }
    res.json({ message: "Audio deleted successfully" });
  });

  fs.unlink(filePath + ".json", (err) => {
    if (err) {
      return res.status(500).json({ error: "Unable to delete metadata file" });
    }
    res.json({ message: "Metadata deleted successfully" });
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
