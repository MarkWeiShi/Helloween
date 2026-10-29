# Play unlock screen

The initial scene renders the actual rotating pumpkin map under an inert app shell. Only the lock icon and Enable Mic & Play control are interactive. Old welcome artwork, intro copy, sound switch and skip action are removed. Invitation routes also pass through this gate before their existing invitation view.

The click resumes a persistent Web Audio context directly in the gesture and requests browser microphone permission. Successful permission stops the temporary input tracks immediately, enables game sound, animates the lock shackle and button for 700 ms, plays a quiet ascending chime, then removes the input shield. The entrance does not measure or upload audio; invitation recording retains separate consent. Denial/unavailability leaves the shell inert and shows a retry message. Reduced motion uses a short transition without scaling. Browser permission cannot be bypassed.

Build passed. Targeted Chrome desktop/mobile and WebKit mobile tests cover the rotating background, inert state, simulated successful microphone/audio unlock, stopped tracks, three-note sound scheduling, and refusal/retry. Real device permissions, speaker output and in-app browser restrictions remain unverified. Local only.
