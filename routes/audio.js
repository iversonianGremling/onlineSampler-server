// audio.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const NodeID3 = require("node-id3"); // For MP3 files
const util = require("util");
const archiver = require("archiver");

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
  const uploadDate = new Date().toISOString();

  // Create customTags json file
  const jsonFilePath = `${req.file.path}.json`;
  const initialData = {
    customTags: [],
    uploadDate,
    lastModifiedDate: uploadDate,
  };
  fs.writeFile(jsonFilePath, JSON.stringify(initialData), (err) => {
    if (err) {
      console.error("Error creating customTags file: ", err);
    }
  });

  res.status(201).json({
    message: "Audio uploaded successfully",
    file: req.file,
    uploadDate,
  });
});

//UPDATE: Update Audio metadata
router.put("/:filename/metadata", async (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);
  const extname = path.extname(filePath).toLowerCase();
  const jsonFilePath = `${filePath}.json`;

  fs.readFile(jsonFilePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading customTags file: ", err);
      return;
    }

    const fileData = JSON.parse(data);
    const updatedMetadata = {
      ...fileData,
      ...req.body,
      lastModifiedDate: new Date().toISOString(),
    };
    console.log("Updated Metadata: ", updatedMetadata);

    fs.writeFile(jsonFilePath, JSON.stringify(updatedMetadata), (err) => {
      if (err) {
        console.error("Error updating customTags file: ", err);
        return;
      }
      console.log(
        `Metadata updated successfully on file: ${filePath}.json \nWith metadata`,
        updatedMetadata
      );

      res.status(200).json({
        message: `Metadata updated successfully`,
        updatedMetadata,
      });
    });
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
          `${path.basename(file)}.json`
        );

        const data = await fs.promises.readFile(jsonFilePath, "utf8");
        console.log(`Reading file ${jsonFilePath}: `, data);
        customTags = JSON.parse(data).tags || [];
        console.log(`Custom Tags: `, customTags);
        customTags =
          typeof customTags === "string" || customTags instanceof String
            ? customTags.split(",")
            : [];
        return { file, customTags };
      })
    );

    res.json(filesWithTags);
  });
});

// Serve audio files
router.get("/:filename", (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ error: "File not found" });
    }

    res.sendFile(filePath);
  });
});

// READ: Get Metadata of an Audio file
router.get("/:filename/metadata", async (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);
  const extname = path.extname(filePath).toLowerCase();

  try {
    const jsonFilePath = `${filePath}.json`;
    console.log(`Accessing file: ${jsonFilePath}`);
    const metadata = JSON.parse(
      await fs.promises.readFile(jsonFilePath, "utf8")
    );

    const result = {
      title: metadata.title || "",
      artist: metadata.artist || "",
      bpm: metadata.bpm || "",
      duration: metadata.duration || 0,
      tags: metadata.tags || [],
    };

    res.json(result);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Unable to read metadata", details: err.message });
  }
});

// DELETE: Delete an Audio file
router.delete("/:filename", (req, res) => {
  const filePath = path.join(audioDirectory, req.params.filename);

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: "Unable to delete audio file" });
    }
    fs.unlink(`${filePath.replace(path.extname(filePath), "")}.json`, (err) => {
      if (err) {
        return res
          .status(500)
          .json({ error: "Unable to delete metadata file" });
      }
      res.json({ message: "Audio and metadata deleted successfully" });
    });
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

router.delete("/multiple", async (req, res) => {
  // {
  //   "filenames": ["file1.mp3", "file2.mp3", "file3.mp3"]
  // }
  const { filenames } = req.body;

  for (const filename of filenames) {
    const filePath = path.join(audioDirectory, filename);
    try {
      await fs.promises.unlink(filePath);
      await fs.promises.unlink(
        `${filePath.replace(path.extname(filePath), "")}.json`
      );
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Unable to delete files", details: err.message });
    }
  }

  res.json({ message: "Files deleted successfully" });
});

// POST: Download multiple audio files as a zip
router.post("/download", async (req, res) => {
  const filenames = req.query.filenames ? req.query.filenames.split(",") : [];
  console.log(`Filenames received: `, filenames);

  if (filenames.length === 0) {
    return res.status(400).json({ error: "No filenames provided" });
  }

  const archive = archiver("zip", {
    zlib: { level: 9 }, // Compression level
  });

  archive.on("error", (err) => {
    res.status(500).send({ error: err.message });
  });

  res.attachment("files.zip");
  archive.pipe(res);

  for (const filename of filenames) {
    const filePath = path.join(audioDirectory, filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: filename });
    } else {
      console.log(`File not found: ${filename}`);
    }
  }

  await archive.finalize();
});

router.put("/multiple/metadata", async (req, res) => {
  // {
  //   "filenames": ["file1.mp3", "file2.mp3", "file3.mp3"],
  //   "metadata": {
  //     "artist": "New Artist",
  //     "title": "New Title",
  //     // Only include the fields you want to update
  //   }
  // }
  const { filenames, metadata } = req.body;

  for (const filename of filenames) {
    const filePath = path.join(audioDirectory, filename);
    const extname = path.extname(filePath).toLowerCase();
    const jsonFilePath = `${filePath.replace(extname, "")}.json`;

    let existingMetadata;
    try {
      const data = await fs.promises.readFile(jsonFilePath, "utf8");
      existingMetadata = JSON.parse(data);
    } catch (err) {
      console.error("Error reading existing metadata file: ", err);
      existingMetadata = {};
    }

    const updatedMetadata = {
      ...existingMetadata,
      ...metadata,
    };

    try {
      await fs.promises.writeFile(
        jsonFilePath,
        JSON.stringify(updatedMetadata)
      );
      if (extname === ".mp3") {
        const tags = {
          title: updatedMetadata.title,
          artist: updatedMetadata.artist,
          bpm: updatedMetadata.bpm,
          comment: { text: updatedMetadata.tags?.join(", ") },
        };
        NodeID3.write(tags, filePath);
      }
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Unable to edit metadata", details: err.message });
    }
  }

  res.json({ message: "Metadata updated successfully" });
});

// CREATE: Upload new Audio files
router.post("/", upload.array("files", 10), (req, res) => {
  console.log(req.files); // Log the files received by Multer
  if (!req.files) {
    return res.status(400).json({ message: "No files received" });
  }

  const uploadDate = new Date().toISOString();
  const files = req.files.map((file) => {
    const jsonFilePath = `${file.path}.json`;
    const initialData = {
      customTags: [],
      uploadDate,
      lastModifiedDate: uploadDate,
    };
    fs.writeFile(jsonFilePath, JSON.stringify(initialData), (err) => {
      if (err) {
        console.error("Error creating customTags file: ", err);
      }
    });

    return { ...file, uploadDate };
  });

  res.status(201).json({ message: "Audio files uploaded successfully", files });
});

module.exports = router;
