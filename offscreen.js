let archive = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target !== "offscreenZip") return;

    if (request.action === "zipStart") {
        archive = new JSZip();
        sendResponse({ success: true });
        return;
    }

    if (request.action === "zipAddFile") {
        if (!archive) {
            sendResponse({ success: false, error: "ZIP archive was not initialized." });
            return;
        }
        archive.file(request.path, request.data, request.base64 ? { base64: true } : undefined);
        sendResponse({ success: true });
        return;
    }

    if (request.action === "zipFinalize") {
        finalizeArchive(request.filename)
            .then(blobUrl => sendResponse({ success: true, blobUrl }))
            .catch(error => sendResponse({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        return true;
    }
});

async function finalizeArchive(filename) {
    if (!archive) throw new Error("ZIP archive was not initialized.");

    const blob = await archive.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
    });
    const blobUrl = URL.createObjectURL(blob);

    archive = null;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    return blobUrl;
}
