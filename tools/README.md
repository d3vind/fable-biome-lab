# Authoring pipeline

`index.html` is the deliverable and is a plain concatenation of `src/p*.js` —
there is no bundler, no transform and no minifier. Both directions are tracked
here so the shipped file is auditable to its source rather than being a 5,800
line artefact nobody can review.

```
tools/build.sh                       # src/  -> index.html   (writes it in place)
tools/unbuild.sh index.html out/     # index.html -> out/p*.js
```

They are exact inverses. `build.sh` is `cat` plus the closing tags; `unbuild.sh`
splits on each part's banner comment, verifies every banner occurs exactly once,
and errors rather than guessing if one is missing or duplicated.

Why the second direction exists: `src/` used to live outside version control, so
the only tracked copy of this world was the concatenation. That made the source
tree a single point of failure — one bad concurrent write and the authoring
sources were gone, with only a built file to reconstruct them from. `unbuild.sh`
closes that: the tree is recoverable from any commit, so experiments against it
are disposable.

Edit `src/`, run `tools/build.sh`, commit both. A commit where `index.html` is
not what `tools/build.sh` produces from `src/` is a broken commit; the two are
meant to be checked together.
