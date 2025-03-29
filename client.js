import { existsSync, readFileSync, writeFileSync } from "fs";
import chokidar from "chokidar";
import { resolve, sep } from "path";
import tk from "terminal-kit";

var term = tk.terminal;
term.clear();

var ws = null;
var watcher = null;
var heartbeatInterval = null;

term.on('key', function(name) {
	if (name === 'CTRL_C') {
        if (ws) ws.close();
        if (watcher) watcher.close();
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        process.exit(0)
    }
});

if (process.argv.length != 4) {
    throw "Invalid argument count, did you copy paste the command off the ferret intstance correctly?";
}

var host = process.argv[2];
var token = process.argv[3];
var lastSourceFolder = existsSync("lastSourceFolder.txt") ? readFileSync("lastSourceFolder.txt").toString() : "";

term.bold(true);
term.white("Host ").green(host + "\n");
term.white("Token ").green(token.substring(0, 5) + "*".repeat(token.length-5) + "\n");

term.white("Filepath ")
term.cyan()

var fileSource;
while (true) {
    if (lastSourceFolder)
        term.bold(false).gray(`(${lastSourceFolder})`).bold(false)
    fileSource = await term.inputField().promise;
    if (fileSource || lastSourceFolder) {
        if (fileSource) {
            lastSourceFolder = fileSource;
        }
        fileSource = lastSourceFolder;
        break;
    }
}
writeFileSync("lastSourceFolder.txt", fileSource);

term.moveTo(0, 3);
term.bold(true).white("Filepath ").green(fileSource + "  \n").bold(false);

ws = new WebSocket(host + "/socket/client_source", {
    headers: {
      cookie: "authToken=" + token + ";"
    }
});

ws.addEventListener("error", (error) => {
    console.error(error);
})

ws.addEventListener("open", ()=> {
    console.log("Open, beginning file system watch");
    
    watcher = chokidar.watch(fileSource, {
        ignored: [fileSource + sep + '.git'],
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

var sourceFilePath = resolve(fileSource);

function logTermError(message) {
    term.bold(true).red(message + "\n").bold(false);
}

ws.addEventListener("message", async (message)=>{
    var message = message.data;

    if (message.startsWith("Your id is ")) {
        term.bold(true).white("Source Id ").cyan(message.substring("Your id is ".length) + "\n").bold(false);
    } else {
        console.log("Recived message:", message);
    }

    try {
        var data = JSON.parse(message);
    } catch {
        return;
    }
    if (data.type == "request") {
        console.log("Recived request for file", data.filename);
        var targetPath = fileSource + sep + data.filename;
        if (resolve(targetPath).startsWith(sourceFilePath)) {
            if (existsSync(targetPath)) {
                ws.send(JSON.stringify({
                    type: "request_response",
                    request_id: data.request_id,
                    result: "success",
                    response: readFileSync(targetPath).toString(),
                }));
            } else {
                logTermError(`Recived request for missing file ${targetPath}`);
                ws.send(JSON.stringify({
                    type: "request_response",
                    request_id: data.request_id,
                    result: "error",
                    response: `File '${targetPath}' doesen't exist!`,
                }));
            }
        } else {
            logTermError(`Recived request for out of bounds file ${targetPath}`);
            ws.send(JSON.stringify({
                type: "request_response",
                request_id: data.request_id,
                result: "error",
                response: `Invalid path '${targetPath}'`,
            }));
        }
    }
});

ws.addEventListener("close", ()=>{
    term.bold(true).red("Connection to server closed").bold(false);
    if (watcher) watcher.close()
    if (heartbeatInterval) clearInterval(heartbeatInterval);
});

heartbeatInterval = setInterval(() => {
    if (ws) {
        ws.send(JSON.stringify({
            type: "keep_alive_heartbeat"
        }));
    }
}, 50000);