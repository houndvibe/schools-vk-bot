import { Router } from "express";
import { z } from "zod";

import type { CampaignsService } from "../services/campaignsService.js";

// HTTP-роутер ручного запуска mock-кампаний: валидирует входные DTO и делегирует отправку
// в CampaignsService для трех сценариев (произвольная рассылка, опрос после урока,
// напоминание о подтверждении), сохраняя стабильный API для будущего backend-провайдера.

const arbitraryMessageSchema = z.object({
  schoolId: z.string().min(1),
  message: z.string().min(1),
  vkUserIds: z.array(z.number().int().positive()).optional(),
});

const surveySchema = z.object({
  schoolId: z.string().min(1),
  lessonId: z.string().min(1),
});

const attendanceSchema = z.object({
  schoolId: z.string().min(1),
  date: z.string().min(1),
  mode: z.enum(["day_before", "same_day"]),
});

export function createMockCampaignsRouter(campaignsService: CampaignsService): Router {
  const router = Router();

  //Произвольные
  router.post("/messages/send", async (req, res, next) => {
    try {
      const parsed = arbitraryMessageSchema.parse(req.body);
      const result = await campaignsService.sendArbitraryMessage(parsed);
      res.status(200).json({
        status: "ok",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  //Опросы после урока
  router.post("/surveys/send", async (req, res, next) => {
    try {
      const parsed = surveySchema.parse(req.body);
      const result = await campaignsService.sendSurvey(parsed);
      res.status(200).json({
        status: "ok",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  //Напоминания о подтверждении
  router.post("/attendance-reminders/send", async (req, res, next) => {
    try {
      const parsed = attendanceSchema.parse(req.body);
      const result = await campaignsService.sendAttendanceReminder(parsed);
      res.status(200).json({
        status: "ok",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
