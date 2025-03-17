import { readFileSync, writeFileSync } from "fs";
import chokidar from "chokidar";
import promptModule from "prompt-sync";
import { exit } from "process";
import { resolve, sep } from "path";
const prompt = promptModule();

function parseConfig(text) {
    var entries = {};
    var lines = text.split("\n");
    for (var line of lines) {
        if (line.trim() == "") continue;
        var data = line.split("=");
        entries[data[0]] = data[1].trim();
    }
    return entries;
}

const config = parseConfig(readFileSync("./config.txt").toString());

console.log("Config:", config);

for (var key in config) {
    if (config[key] == "unset") {
        console.log("Please enter config key for", key);
        var result = prompt("");
        if (result == null) {
            exit(1);
        }
        config[key] = result;
    }
}

var configWritten = "";
for (var key in config) {
    configWritten += key + "=" + config[key] + "\r\n";
}
writeFileSync("./config.txt", configWritten);

const ws = new WebSocket(config.host, {
    headers: {
      cookie: "authToken=" + config.token + ";"
    }
});

var watcher = null;
ws.addEventListener("open", ()=> {
    console.log("Open, beginning file system watch");
    
    watcher = chokidar.watch(config.src, {
        ignored: [config.src + sep + '.git'],
        persistent: true,
        ignoreInitial: true,
    });
    watcher.on('all', (event, path) => {
        console.log("File system change (", event, path, "), triggering reload");
        ws.send(JSON.stringify({
            type: "trigger_reload"
        }))
    });
});

var sourceFilePath = resolve(config.src);

ws.addEventListener("message", async (message)=>{
    var message = message.data;
    console.log("Recived message:", message)
    try {
        var data = JSON.parse(message);
    } catch {
        return;
    }
    if (data.type == "request") {
        console.log("Recived request for file", data.filename);
        var targetPath = config.src + sep + data.filename;
        if (resolve(targetPath).startsWith(sourceFilePath)) {
            ws.send(JSON.stringify({
                type: "request_response",
                request_id: data.request_id,
                response: readFileSync(targetPath).toString(),
            }));
        } else {
            console.log("Recived out of bounds file requiest!", targetPath)
        }
    }
});

ws.addEventListener("close", ()=>{
    console.log("Connection to server closed");
    if (watcher)
        watcher.close()
});