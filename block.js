const params = new URLSearchParams(window.location.search);
const site = params.get("site");
const reason = params.get("reason") || "Blocked by policy";

document.getElementById("reason").textContent =
  `This page (${site}) was blocked. Reason: ${reason}`;

document.getElementById("unblockBtn").onclick = () => {
  chrome.runtime.sendMessage({ type: "whitelist", site });
  alert("Added to whitelist. Please refresh the page.");
};
