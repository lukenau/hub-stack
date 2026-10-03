# Tester privacy notice

A short notice for anyone you point at a server that is not their own. Hand it
over as-is; the full account of what the code does with data is in
[PRIVACY.md](PRIVACY.md).

**The notice, in full — five lines:**

1. **What the server stores about you:** your messages to the agent and any
   images you attach; the public half of your device key and any passkey, which
   authorise your writes; a push token if you turned notifications on; and
   ordinary logs that your device connected and what it did.
2. **Where it lives:** on the machine of whoever runs that server. hub-stack has
   no cloud and no author-run service in the middle, so nothing about you
   reaches anyone else.
3. **How long:** nothing expires by itself; it stays until it is deleted.
4. **How to get it deleted:** ask whoever runs the server — they can delete your
   messages, remove your device key and clear your push token.
5. **Who to contact:** that same person. For this beta that is whoever sent you
   the invite — reachable through the app's TestFlight feedback button, or on
   GitHub at [@lukenau](https://github.com/lukenau).

If you run your own hub instead, the answer to all five is "you": the data is on
your own machine, nothing leaves it, and you can delete it whenever you like.

---

## Notes for the person hosting

The app itself collects nothing: it has no account, no login, and no telemetry
or crash-reporting SDK, and it does not phone home. It talks only to the server
address it was pointed at.

The server has no per-request authentication: anyone who can reach it can read
everything it exposes, including those messages. Keeping it out of reach is the
host's job, not the app's, so it is fair for a tester to ask how it has been
locked down. Keep the circle small and personal — see the [README's hosting
section](../README.md#if-you-host-this-for-other-people).
