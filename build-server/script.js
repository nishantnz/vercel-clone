const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types");
const Redis = require("ioredis");

const publisher = new Redis("");

const s3Client = new S3Client({
  region: "",
  credentials: {
    accessKeyId: "",
    secretAccessKey: "",
  },
});

const PROJECT_ID = process.env.PROJECT_ID;

function publishLog(log) {
  publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }));
}

async function init() {
  console.log("Executing script.js");
  publishLog("Build Started...");
  const outDirPath = path.join(__dirname, "output");

  const p = exec(`cd ${outDirPath} && npm install && npm run build`);

  p.stdout.on("data", function (data) {
    console.log(data.toString());
    publishLog(data.toString());
  });

  p.stdout.on("error", function (data) {
    console.log("Error", data.toString());
    publishLog(`error: ${data.toString()}`);
  });

  p.on("close", async function () {
    console.log("Build Complete");
    publishLog(`Build Complete`);

    const possibleFolders = ["dist", "build"];
    let distFolderPath = null;
    for (const folder of possibleFolders) {
      const possibleFolderPath = path.join(__dirname, "output", folder);
      if (existsSync(possibleFolderPath)) {
        distFolderPath = possibleFolderPath;
        break;
      }
    }
    if (!distFolderPath) {
      console.error("Neither 'dist' nor 'build' folder found!");
      publishLog("Neither 'dist' nor 'build' folder found!");
      return;
    }

    const distFolderContents = fs.readdirSync(distFolderPath, {
      recursive: true,
    });

    publishLog(`Starting to upload`);
    for (const file of distFolderContents) {
      const filePath = path.join(distFolderPath, file);
      if (fs.lstatSync(filePath).isDirectory()) continue;

      console.log("Uploading", filePath);
      publishLog(`Uploading ${file}`);

      const command = new PutObjectCommand({
        Bucket: "vercel-clone-outputs",
        Key: `__outputs/${PROJECT_ID}/${file}`,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath),
      });
      try {
        await s3Client.send(command);
        publishLog(`Uploaded ${file}`);
        console.log("Uploaded file", filename);
      } catch (err) {
        console.error("Error uploading file:", err);
        publishLog(`Error uploading file: ${err}`);
        throw err;
      }
    }
    console.log("Uploaded", filePath);
    publishLog("Upload complete");
    console.log("Done...");
    publishLog(`Done`);
  });
}

init();
