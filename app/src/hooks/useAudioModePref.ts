'use client';

import { useEffect, useState } from 'react';
import { subscribeAlwaysOnMic, subscribeAudioMode } from '@/lib/audio-mode-pref';

/** Live view of the Watcher's audio-mode preference for a campaign (false until mounted / when no campaign). */
export function useAudioModePref(campaignId: string | null | undefined): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!campaignId) { setOn(false); return; }
    return subscribeAudioMode(campaignId, setOn);
  }, [campaignId]);
  return on;
}

/** Live view of the opt-in always-on mic preference for a campaign (default OFF). */
export function useAlwaysOnMicPref(campaignId: string | null | undefined): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!campaignId) { setOn(false); return; }
    return subscribeAlwaysOnMic(campaignId, setOn);
  }, [campaignId]);
  return on;
}
