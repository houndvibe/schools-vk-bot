const resultNode = document.querySelector("#result");
const clearResultButton = document.querySelector("#clear-result");
const forms = document.querySelectorAll("form[data-endpoint]");
const emptyCallbackMessage = "Ожидаю входящие события VK на /vk/callback.";
let lastRenderedCallbackKey = null;
let isSubmitting = false;

for (const form of forms) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button[type='submit']");
    const endpoint = form.dataset.endpoint;
    const payload = buildPayload(form);

    setResult(`Отправка запроса в ${endpoint}...\n\n${formatJson(payload)}`);
    setBusy(submitButton, true);
    isSubmitting = true;

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

      setResult(formatRequestAccepted(endpoint, data), "success");
    } catch (error) {
      setResult(`Ошибка сети или сервера:\n${error.message}`, "error");
    } finally {
      setBusy(submitButton, false);
      isSubmitting = false;
    }
  });
}

clearResultButton.addEventListener("click", async () => {
  lastRenderedCallbackKey = null;
  setResult(emptyCallbackMessage);

  try {
    await fetch("/debug/vk-callbacks", {
      method: "DELETE",
    });
  } catch {
    // Очистка на сервере не критична для локального интерфейса.
  }
});

void pollVkCallbacks();
setInterval(() => {
  void pollVkCallbacks();
}, 2000);

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

function formatRequestAccepted(endpoint, data) {
  const requested = data?.requested ?? "-";
  const sent = data?.sent ?? "-";

  return [
    `Команда отправлена: ${endpoint}`,
    `Запрошено получателей: ${requested}`,
    `Отправлено: ${sent}`,
    "",
    "Теперь жду входящий message_new от пользователя VK.",
    "Когда пользователь ответит боту, здесь появится его текст и полный payload callback-а.",
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

async function pollVkCallbacks() {
  if (isSubmitting) {
    return;
  }

  try {
    const response = await fetch("/debug/vk-callbacks");
    if (!response.ok) {
      return;
    }

    const data = await readJson(response);
    const latestEvent = findLatestUserMessageEvent(data?.events ?? []);
    const renderKey = latestEvent
      ? `${latestEvent.id}:${latestEvent.responseStatus ?? ""}:${latestEvent.finishedAt ?? ""}`
      : null;
    if (!latestEvent || renderKey === lastRenderedCallbackKey) {
      return;
    }

    lastRenderedCallbackKey = renderKey;
    setResult(formatVkCallback(latestEvent), getCallbackState(latestEvent));
  } catch {
    // Polling не должен мешать ручным запросам из формы.
  }
}

function formatVkCallback(event) {
  const message = getVkMessage(event);
  const userText = message?.text ?? "";

  return [
    `Получен ответ пользователя VK #${event.id}`,
    `Время: ${formatDateTime(event.receivedAt)}`,
    `HTTP статус обработки: ${event.responseStatus ?? "обрабатывается"}`,
    `VK user id: ${message?.from_id ?? "-"}`,
    `Peer id: ${message?.peer_id ?? "-"}`,
    "",
    `Ответ пользователя: ${userText || "(пустое сообщение)"}`,
    "",
  ].join("\n");
}

function findLatestUserMessageEvent(events) {
  return events.find((event) => {
    const payload = event?.payload;

    return payload?.type === "message_new" && Boolean(payload?.object?.message);
  });
}

function getVkMessage(event) {
  return event?.payload?.object?.message;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ru-RU");
}

function getCallbackState(event) {
  if (!event.responseStatus) {
    return "";
  }

  return event.responseStatus >= 200 && event.responseStatus < 300 ? "success" : "error";
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
