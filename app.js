const STORAGE_KEY = "kw_composition_v1";
const API_KEY_STORAGE = "kw_api_key";
const USE_MOCK = true;

const allKeywords = [
  "innovazione",
  "sostenibilità",
  "marketing",
  "design",
  "strategia",
  "analytics",
  "e-commerce",
  "startup",
  "customer experience",
  "branding",
  "mobile",
  "intelligenza artificiale",
  "data science",
  "fintech",
  "logistica",
  "energia verde",
  "cybersecurity",
  "cloud",
  "produttività",
  "leadership",
  "formazione",
  "collaborazione",
  "automazione",
  "ricerca",
  "user research",
  "prototipazione",
  "storytelling",
  "community",
  "servizio clienti",
  "qualità",
  "performance",
  "scalabilità",
  "supply chain",
  "retention",
  "experience design",
  "multicanale",
];

let composition = Array.from({ length: 10 }, () => null);

const poolEl = document.querySelector("#pool");
const poolCountEl = document.querySelector("#poolCount");
const slotsEl = document.querySelector("#slots");
const generateBtn = document.querySelector("#generateBtn");
const clearBtn = document.querySelector("#clearBtn");
const outputStatusEl = document.querySelector("#outputStatus");
const outputBodyEl = document.querySelector("#outputBody");
const toastEl = document.querySelector("#toast");
const trashEl = document.querySelector("#trash");

const getUsedKeywords = () => composition.filter(Boolean);

const saveComposition = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(composition));
};

const loadComposition = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    if (
      Array.isArray(parsed) &&
      parsed.length === 10 &&
      parsed.every((item) => typeof item === "string" || item === null)
    ) {
      composition = parsed;
    }
  } catch (error) {
    console.warn("Invalid stored composition", error);
  }
};

const showToast = (message) => {
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toastEl.classList.remove("visible");
  }, 2200);
};

const renderPool = () => {
  const used = new Set(getUsedKeywords());
  const available = allKeywords.filter((keyword) => !used.has(keyword));
  poolEl.innerHTML = "";
  poolCountEl.textContent = String(available.length);

  available.forEach((keyword) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.draggable = true;
    chip.textContent = keyword;
    chip.dataset.keyword = keyword;

    chip.addEventListener("dragstart", (event) => {
      chip.classList.add("dragging");
      event.dataTransfer.setData("text/plain", keyword);
      event.dataTransfer.setData("source", "pool");
      event.dataTransfer.setData("keyword", keyword);
      event.dataTransfer.effectAllowed = "move";
    });

    chip.addEventListener("dragend", () => {
      chip.classList.remove("dragging");
    });

    poolEl.appendChild(chip);
  });
};

const renderSlots = () => {
  slotsEl.innerHTML = "";
  composition.forEach((keyword, index) => {
    const slot = document.createElement("li");
    slot.className = "slot";
    slot.dataset.index = String(index);

    if (keyword) {
      slot.classList.add("filled");
    }

    slot.addEventListener("dragover", (event) => {
      event.preventDefault();
      slot.classList.add("dragover");
    });

    slot.addEventListener("dragleave", () => {
      slot.classList.remove("dragover");
    });

    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      slot.classList.remove("dragover");
      handleDropOnSlot(event, index);
    });

    const indexLabel = document.createElement("span");
    indexLabel.className = "slot__index";
    indexLabel.textContent = `#${index}`;

    const content = document.createElement("div");
    content.className = "slot__content";

    if (keyword) {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.draggable = true;
      chip.textContent = keyword;
      chip.dataset.keyword = keyword;

      chip.addEventListener("dragstart", (event) => {
        chip.classList.add("dragging");
        event.dataTransfer.setData("text/plain", keyword);
        event.dataTransfer.setData("source", "slot");
        event.dataTransfer.setData("keyword", keyword);
        event.dataTransfer.setData("fromIndex", String(index));
        event.dataTransfer.effectAllowed = "move";
      });

      chip.addEventListener("dragend", () => {
        chip.classList.remove("dragging");
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "slot__remove";
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", `Rimuovi keyword ${keyword}`);
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        composition[index] = null;
        saveAndRender();
      });

      content.appendChild(chip);
      slot.appendChild(indexLabel);
      slot.appendChild(content);
      slot.appendChild(removeBtn);
      slot.setAttribute("aria-label", `Slot ${index}: keyword ${keyword}`);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "slot__placeholder";
      placeholder.textContent = "Slot vuoto";

      content.appendChild(placeholder);
      slot.appendChild(indexLabel);
      slot.appendChild(content);
      slot.setAttribute("aria-label", `Slot ${index}: vuoto`);
    }

    slotsEl.appendChild(slot);
  });
};

const renderOutput = (state, message) => {
  outputStatusEl.className = `status ${state === "loading" ? "loading" : ""} ${
    state === "error" ? "error" : ""
  }`;
  outputStatusEl.textContent = state;
  outputBodyEl.textContent = message;
};

const saveAndRender = () => {
  saveComposition();
  renderPool();
  renderSlots();
};

const parseDataTransfer = (event) => {
  const source = event.dataTransfer.getData("source");
  const keyword = event.dataTransfer.getData("keyword");
  const fromIndexValue = event.dataTransfer.getData("fromIndex");
  const fromIndex = fromIndexValue === "" ? null : Number(fromIndexValue);

  if (!source || !keyword) {
    return null;
  }

  return {
    source,
    keyword,
    fromIndex: Number.isFinite(fromIndex) ? fromIndex : null,
  };
};

const handleDropOnSlot = (event, targetIndex) => {
  const payload = parseDataTransfer(event);
  if (!payload) {
    return;
  }

  const { source, keyword, fromIndex } = payload;

  if (source === "slot") {
    if (fromIndex === null) {
      return;
    }

    if (fromIndex === targetIndex) {
      return;
    }

    const targetValue = composition[targetIndex];

    if (!targetValue) {
      composition[targetIndex] = composition[fromIndex];
      composition[fromIndex] = null;
    } else {
      composition[targetIndex] = composition[fromIndex];
      composition[fromIndex] = targetValue;
    }

    saveAndRender();
    return;
  }

  if (source === "pool") {
    if (composition.includes(keyword)) {
      showToast("Keyword già usata nella composizione.");
      return;
    }

    composition[targetIndex] = keyword;
    saveAndRender();
  }
};

const handleDropOnTrash = (event) => {
  event.preventDefault();
  const payload = parseDataTransfer(event);
  if (!payload || payload.source !== "slot") {
    return;
  }

  if (payload.fromIndex === null) {
    return;
  }

  composition[payload.fromIndex] = null;
  saveAndRender();
};

const buildAIPrompt = (orderedKeywords) => {
  const list = orderedKeywords
    .map((keyword, index) => `${index + 1}) ${keyword}`)
    .join(" ");

  return `Genera UNA sola frase in italiano che includa e colleghi in modo naturale, in questo ESATTO ordine, le seguenti keyword: ${list}. La frase deve essere grammaticale, niente liste, niente virgolette. Massimo 25 parole.`;
};

const mockGenerate = (orderedKeywords) => {
  const connectors = ["poi", "mentre", "così", "inoltre", "infine", "quindi"];
  return orderedKeywords
    .map((keyword, index) => {
      if (index === 0) {
        return `${keyword}`;
      }
      const connector = connectors[index % connectors.length];
      return `${connector} ${keyword}`;
    })
    .join(", ")
    .replace(/,([^,]*)$/, " e$1")
    .concat(".");
};

const callTextModel = async (prompt) => {
  const endpoint = "https://example.com/generate";
  const apiKey = localStorage.getItem(API_KEY_STORAGE) || "";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey ? `Bearer ${apiKey}` : "",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error("API error");
  }

  const data = await response.json();
  return data.text ?? "";
};

const handleGenerate = async () => {
  const orderedKeywords = getUsedKeywords();

  if (orderedKeywords.length === 0) {
    renderOutput("error", "Inserisci almeno una keyword");
    return;
  }

  const prompt = buildAIPrompt(orderedKeywords);
  renderOutput("loading", "Generazione frase in corso...");

  try {
    const sentence = USE_MOCK
      ? mockGenerate(orderedKeywords)
      : await callTextModel(prompt);
    renderOutput("idle", sentence || "Nessuna risposta dall'AI");
  } catch (error) {
    renderOutput("error", "Errore durante la generazione. Riprova.");
  }
};

const handleClear = () => {
  composition = Array.from({ length: 10 }, () => null);
  saveAndRender();
  renderOutput("idle", "Composizione azzerata. Seleziona nuove keyword.");
};

trashEl.addEventListener("dragover", (event) => {
  event.preventDefault();
  trashEl.classList.add("dragover");
});

trashEl.addEventListener("dragleave", () => {
  trashEl.classList.remove("dragover");
});

trashEl.addEventListener("drop", (event) => {
  trashEl.classList.remove("dragover");
  handleDropOnTrash(event);
});

trashEl.addEventListener("click", () => {
  const filledIndex = composition.findIndex((item) => item !== null);
  if (filledIndex === -1) {
    showToast("Nessuna keyword da rimuovere.");
    return;
  }
  composition[filledIndex] = null;
  saveAndRender();
});

generateBtn.addEventListener("click", handleGenerate);
clearBtn.addEventListener("click", handleClear);

loadComposition();
renderPool();
renderSlots();
renderOutput("idle", "Seleziona le keyword e genera una frase.");
