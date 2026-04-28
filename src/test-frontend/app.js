const resultNode = document.querySelector("#result");
const clearResultButton = document.querySelector("#clear-result");
const forms = document.querySelectorAll("form[data-endpoint]");

for (const form of forms) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button[type='submit']");
    const endpoint = form.dataset.endpoint;
    const payload = buildPayload(form);

    setResult(`Отправка запроса в ${endpoint}...\n\n${formatJson(payload)}`);
    setBusy(submitButton, true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await readJson(response);

      if (!response.ok) {
        setResult(formatError(response, data), "error");
        return;
      }

      setResult(formatSuccess(endpoint, data), "success");
    } catch (error) {
      setResult(`Ошибка сети или сервера:\n${error.message}`, "error");
    } finally {
      setBusy(submitButton, false);
    }
  });
}

clearResultButton.addEventListener("click", () => {
  setResult("Здесь появится ответ API.");
});

function buildPayload(form) {
  const data = new FormData(form);
  const kind = form.dataset.kind;

  if (kind === "message") {
    const vkUserIds = parseVkUserIds(data.get("vkUserIds"));
    const payload = {
      schoolId: getRequired(data, "schoolId"),
      message: getRequired(data, "message"),
    };

    if (vkUserIds.length > 0) {
      payload.vkUserIds = vkUserIds;
    }

    return payload;
  }

  if (kind === "survey") {
    return {
      schoolId: getRequired(data, "schoolId"),
      lessonId: getRequired(data, "lessonId"),
    };
  }

  if (kind === "attendance") {
    return {
      schoolId: getRequired(data, "schoolId"),
      date: getRequired(data, "date"),
      mode: getRequired(data, "mode"),
    };
  }

  throw new Error(`Неизвестная форма: ${kind}`);
}

function getRequired(data, key) {
  return String(data.get(key) ?? "").trim();
}

function parseVkUserIds(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatSuccess(endpoint, data) {
  const requested = data?.requested ?? "-";
  const sent = data?.sent ?? "-";

  return [
    `Готово: ${endpoint}`,
    `Запрошено получателей: ${requested}`,
    `Отправлено: ${sent}`,
    "",
    formatJson(data),
  ].join("\n");
}

function formatError(response, data) {
  return [
    `Ошибка ${response.status} ${response.statusText}`,
    getErrorMessage(data),
    "",
    formatJson(data),
  ].join("\n");
}

function getErrorMessage(data) {
  if (typeof data === "string") {
    return data;
  }

  if (data?.error) {
    return data.error;
  }

  return "Запрос не выполнен.";
}

function formatJson(value) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function setResult(text, state = "") {
  resultNode.textContent = text;
  resultNode.className = state;
}

function setBusy(button, isBusy) {
  if (!button) {
    return;
  }

  button.disabled = isBusy;
}
