import type { RequestHandler } from "express";

import type { SchoolRegistry } from "../domain/schoolRegistry.js";

//Генерация Диплинка в диалог VK: /s/:schoolId -> редирект на vk.com/im?...

export function createDeepLinkHandler(
  schoolRegistry: SchoolRegistry,
): RequestHandler {
  return (req, res) => {
    const schoolIdParam = req.params.schoolId;
    const schoolId = Array.isArray(schoolIdParam)
      ? schoolIdParam[0]
      : schoolIdParam;
    if (!schoolId) {
      res.status(400).json({ error: "schoolId is required" });
      return;
    }

    const school = schoolRegistry.getByIdOrSlug(schoolId);

    if (!school) {
      res.status(404).json({ error: "Unknown schoolId" });
      return;
    }

    const ref = Buffer.from(
      JSON.stringify({
        schoolId: school.id,
        ts: Date.now(),
      }),
    )
      .toString("base64url")
      .slice(0, 48);

    const target = new URL("https://vk.com/im");
    target.searchParams.set("sel", `-${school.vkGroupId}`);
    target.searchParams.set("start", ref);

    res.redirect(302, target.toString());
  };
}
