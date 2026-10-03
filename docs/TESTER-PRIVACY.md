# Tester privacy notice

A short, plain notice for anyone testing the hub-stack app through TestFlight.
It is the two-minute version; the full description of what the code does with
data is in [PRIVACY.md](PRIVACY.md), and [BETA.md](BETA.md) explains how the
beta works.

**The app collects nothing about you.** It has no account, no login, and no
telemetry or crash-reporting SDK, and it does not phone home. It talks only to
the server address it was pointed at — the one you type into **Config → Server
address**, or the one baked into the build. If nobody gave you a server to use,
that means your data goes to your own machine and nowhere else.

**If you connect to someone's server, that person can see what you do on it.**
Most testers run their own server, so the data is theirs and they hold it. If
instead you were handed a server address by whoever invited you, that person is
the operator, and this is what their server stores about you:

- the messages you send the agent, in its chat database, with any images you
  attach;
- the public half of your device key and any passkey, which authorise your
  writes;
- a push token, only if you turned notifications on;
- ordinary server logs showing that your device connected and what it did.

The server has no per-request authentication: anyone who can reach it can read
everything it exposes, including your messages. Keeping it out of reach is the
operator's job, not the app's — so it is fair to ask them how they have locked
it down.

**How long it is kept.** Nothing expires by itself. Your messages, key, token
and logs sit there until they are deleted; the only short-lived thing is the
enrolment code, which expires in minutes.

**Getting it deleted.** Ask the person who runs the server you connected to.
They can delete your messages, remove your device key, and clear your push
token, and they should do it when you ask. For this beta that is whoever sent
you the invite — if that is me, reach me through the TestFlight feedback button
in the app, or on GitHub at [@lukenau](https://github.com/lukenau). If you
self-host, the data is on your own machine and you can just delete it.
