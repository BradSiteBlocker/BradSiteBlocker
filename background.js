// =================================================================
// CHROME EXTENSION BACKGROUND SCRIPT: content-filter-logic
// This script runs in the background and handles all URL requests.
// It uses a GUARANTEED Blocklist and an aggressive AI classifier.
// =================================================================

// --- Configuration ---
// **Note:** Remove // and Replace "HF-Key-Here" with your actual Hugging Face API Key.
const HF_API_KEY = "HF-Key-Here"; 
const HF_MODEL = "facebook/bart-large-mnli"; // Zero-shot classifier

// Permanent safe sites that should NEVER be blocked (even if the AI misclassifies)
const DEFAULT_SAFE = [
    "canvaslms.com", "agasd.org", "google.com/classroom", 
    "agasd.instructure.com", "instructure.com", "clever.com", 
    "readworks.com", "google.com", "youtube.com", "docs.google.com", 
    "mail.google.com", "wikipedia.org", "khanacademy.org", "github.com"
];

// High-Priority labels for aggressive blocking
// The AI will check against these categories
const HIGH_RISK_LABELS = [
    "adult", "unsafe", 
    "gaming", "music", 
    "social media", "gambling", 
    "proxy", "cheating"
];

// Lowered confidence score threshold for high-risk categories for aggressive blocking
// If AI confidence >= 60%, the site is blocked if it matches a high-risk label.
const BLOCK_THRESHOLD = 0.6; 


// --- Setup: Define Guaranteed Blocklist on First Install/Update ---
chrome.runtime.onInstalled.addListener(() => {
    // These domains are known to be banned in most schools and MUST be blocked.
    // Adding them here ensures they are always the first line of defense.
    const mustBlockDomains = [
        "minecraft.net", 
        "roblox.com",
        "discord.com",
        "steamcommunity.com",
        "epicgames.com",
        "fortnite.com",
        "onlyfans.com", 
        "pornhub.com", 
        "xvideos.com", 
        "thepiratebay.org",
        "chatgpt.com",
        "facebook.com",
        "blender.org",
        "tiktok.com",
        "whatsapp.com",
        "irs.gov",
        "bbc.com",
        "icloud.com",
        "dev.to",
        "apple.com",
        "instagram.com",
        "fbi.gov",
        "walmart.com",
        "amazon.com",
        "instacart.com",
        "aldi.us",
        "turbotax.intuit.com",
        "intuit.com",
        "croxy.org",
        "tylerhalltech.com",
        "tylerhalltech.com/noguardian2/"
    ];

    // Initialize blocklist if it doesn't exist, merging with must-block domains
    chrome.storage.sync.get("blocklist", (data) => {
        const existingBlocklist = data.blocklist || [];
        const combinedBlocklist = new Set([...existingBlocklist, ...mustBlockDomains]);
        
        // Save the list back to storage
        chrome.storage.sync.set({ blocklist: Array.from(combinedBlocklist) });
    });
});


// --- Helper Functions ---

/**
 * Checks if the URL matches any string in the provided list.
 * @param {string} url - The URL to check.
 * @param {string[]} list - The list of domains/keywords to match against.
 * @returns {boolean} True if a match is found.
 */
function matchList(url, list) {
    // Note: This is case-insensitive and checks if the URL *contains* the string.
    const lowerUrl = url.toLowerCase();
    return list.some(site => lowerUrl.includes(site.toLowerCase()));
}

/**
 * Uses the Hugging Face zero-shot classifier to categorize the content.
 * @param {string} url - The URL of the site.
 * @param {string} title - The title of the page (if available).
 * @returns {Promise<{label: string, score: number}>} The top classification label and its confidence score.
 */
async function classifySite(url, title) {
    // Input is the combination of the page title and the URL
    const input = `${title || "Unknown Title"} - ${url}`; 
    
    const candidate_labels = [
        "educational", "work", "entertainment", 
        "adult", "unsafe", "gaming", "music", 
        "social media", "gambling", "proxy", "cheating"
    ];

    try {
        const response = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                inputs: input,
                parameters: {
                    candidate_labels: candidate_labels,
                    multi_label: false
                }
            })
        });

        const result = await response.json();
        
        if (result.error || !result.labels || result.labels.length === 0) {
            console.error("HF API error or empty result:", result);
            return { label: "educational", score: 0.0 }; // Default to safe with low score on API failure
        }
        
        // Return the top label and its confidence score
        return { label: result.labels[0], score: result.scores[0] };
        
    } catch (e) {
        console.error("Fetch or parsing error:", e);
        return { label: "educational", score: 0.0 }; // Default to safe with low score on network error
    }
}


// --- Main Logic: The Blocking Engine ---
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    // Only process top-level navigation to HTTP/HTTPS pages
    if (details.frameId !== 0 || !details.url.startsWith("http")) return;

    chrome.tabs.get(details.tabId, async (tab) => {
        const url = details.url;

        // Load user lists from storage
        chrome.storage.sync.get(["blocklist", "whitelist"], async (data) => {
            const blocklist = data.blocklist || [];
            const whitelist = data.whitelist || [];

            // 1. **WHITELIST CHECK (Highest Priority):** Always allow if on the default safe list or user whitelist.
            if (matchList(url, [...DEFAULT_SAFE, ...whitelist])) {
                console.log(`Allowed (Whitelist/Default Safe): ${url}`);
                return;
            }

            // 2. **GUARANTEED BLOCKLIST CHECK (Second Highest Priority):** Always block if on the user blocklist.
            if (matchList(url, blocklist)) {
                console.log(`Blocked (Blocklist): ${url}`);
                chrome.tabs.update(details.tabId, {
                    url: chrome.runtime.getURL("block.html") +
                        "?site=" + encodeURIComponent(url) +
                        "&reason=" + encodeURIComponent("In the required blocklist")
                });
                return;
            }

            // 3. **AI CLASSIFICATION CHECK (Last Priority):** Use AI for everything else.
            const { label, score } = await classifySite(url, tab.title || "");
            console.log(`AI Check: ${url} -> Classified as '${label}' with confidence ${(score * 100).toFixed(1)}%`);

            // Block if the top label is a HIGH_RISK_LABEL AND the confidence is above the threshold
            if (HIGH_RISK_LABELS.includes(label) && score >= BLOCK_THRESHOLD) {
                console.log(`Blocked (AI): ${url}`);
                chrome.tabs.update(details.tabId, {
                    url: chrome.runtime.getURL("block.html") +
                        "?site=" + encodeURIComponent(url) +
                        "&reason=" + encodeURIComponent(`AI classified as ${label} (${(score * 100).toFixed(1)}%)`)
                });
            }
        });
    });
});

// --- Handle manual whitelist from block page (if you build a UI for it) ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "whitelist") {
        chrome.storage.sync.get("whitelist", (data) => {
            const whitelist = data.whitelist || [];
            // Prevent adding duplicates
            if (!whitelist.includes(msg.site)) {
                whitelist.push(msg.site);
            }
            chrome.storage.sync.set({ whitelist }, () => {
                sendResponse({ success: true });
            });
        });
        return true; // Keep the message channel open for sendResponse
    }
});