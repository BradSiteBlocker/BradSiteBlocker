function renderList(el, list, key) {
  el.innerHTML = "";
  list.forEach((site, i) => {
    const li = document.createElement("li");
    li.textContent = site + " ";
    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.onclick = () => {
      list.splice(i, 1);
      chrome.storage.sync.set({ [key]: list }, () => renderList(el, list, key));
    };
    li.appendChild(btn);
    el.appendChild(li);
  });
}

const siteInput = document.getElementById("siteInput");
const siteBtn = document.getElementById("addSite");
const siteList = document.getElementById("siteList");

const whiteInput = document.getElementById("whiteInput");
const whiteBtn = document.getElementById("addWhite");
const whiteList = document.getElementById("whiteList");

chrome.storage.sync.get(["blocklist", "whitelist"], (data) => {
  renderList(siteList, data.blocklist || [], "blocklist");
  renderList(whiteList, data.whitelist || [], "whitelist");
});

siteBtn.onclick = () => {
  const site = siteInput.value.trim();
  if (!site) return;
  chrome.storage.sync.get("blocklist", (data) => {
    const list = data.blocklist || [];
    if (!list.includes(site)) list.push(site);
    chrome.storage.sync.set({ blocklist: list }, () => renderList(siteList, list, "blocklist"));
  });
  siteInput.value = "";
};

whiteBtn.onclick = () => {
  const site = whiteInput.value.trim();
  if (!site) return;
  chrome.storage.sync.get("whitelist", (data) => {
    const list = data.whitelist || [];
    if (!list.includes(site)) list.push(site);
    chrome.storage.sync.set({ whitelist: list }, () => renderList(whiteList, list, "whitelist"));
  });
  whiteInput.value = "";
};
