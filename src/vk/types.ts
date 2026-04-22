export type VkCallbackUpdate = {
  type: string;
  group_id?: number;
  secret?: string;
  event_id?: string;
  object?: {
    message?: {
      from_id?: number;
      peer_id?: number;
      text?: string;
      payload?: string;
      ref?: string;
      ref_source?: string;
    };
  };
};
