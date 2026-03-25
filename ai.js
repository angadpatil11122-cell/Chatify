let toxicityModel;
const threshold = 0.9;

async function loadToxicityModel() {
    toxicityModel = await toxicity.load(threshold);
    console.log("Toxicity model loaded");
}

async function detectToxicMessage(message) {
    if (!toxicityModel) return { toxic: false, labels: [] };

    const result = await toxicityModel.classify([message]);

    let labels = [];

    result.forEach(pred => {
        if (pred.results[0].match) {
            labels.push(pred.label);
        }
    });

    return {
        toxic: labels.length > 0,
        labels: labels
    };
}

function detectPhishing(message) {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const urls = message.match(urlPattern);

    if (!urls) return { suspicious: false, urls: [] };

    const scamWords = [
        "verify", "login", "bank", "free", "gift",
        "reward", "claim", "reset", "password"
    ];

    const shorteners = ["bit.ly", "tinyurl", "t.co", "goo.gl"];

    for (let url of urls) {
        let lower = url.toLowerCase();

        // suspicious words
        for (let w of scamWords) {
            if (lower.includes(w)) {
                return { suspicious: true, urls };
            }
        }

        // suspicious shorteners
        for (let s of shorteners) {
            if (lower.includes(s)) {
                return { suspicious: true, urls };
            }
        }
    }

    return { suspicious: false, urls };
}






//indexhtml nevbar
const openAuthBtn = document.getElementById("open-auth");
const authOverlay = document.getElementById("auth-overlay");

openAuthBtn.addEventListener("click", () => {
  authOverlay.classList.add("active");
});

authOverlay.addEventListener("click", (e) => {
  if (e.target === authOverlay) {
    authOverlay.classList.remove("active");
  }
});