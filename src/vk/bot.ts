import { randomInt } from "node:crypto";
import { VK } from "vk-io";

import type { SchoolConfig } from "../config.js";

//Отправка сообщений в VK через vk-io

const MAX_VK_RANDOM_ID = 2_147_483_647;

export class VkBotGateway {
  private readonly apiBySchoolId = new Map<string, VK>();

  constructor(schools: SchoolConfig[]) {
    for (const school of schools) {
      this.apiBySchoolId.set(
        school.id,
        new VK({
          token: school.vkToken,
          apiLimit: 20,
          apiVersion: "5.199",
        }),
      );
    }
  }

  async sendText(schoolId: string, peerId: number, message: string): Promise<void> {
    const vk = this.apiBySchoolId.get(schoolId);
    if (!vk) {
      throw new Error(`No VK token configured for schoolId=${schoolId}`);
    }

    await vk.api.messages.send({
      peer_id: peerId,
      message,
      random_id: randomInt(1, MAX_VK_RANDOM_ID),
    });
  }

  async sendTextMany(schoolId: string, peerIds: number[], message: string): Promise<number> {
    let sent = 0;
    for (const peerId of peerIds) {
      await this.sendText(schoolId, peerId, message);
      sent += 1;
    }

    return sent;
  }
}
