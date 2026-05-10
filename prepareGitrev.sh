#!/bin/sh
# Generate src/gitrev.h with the current git commit hash.
# This is the Linux/Haiku equivalent of prepareGitrev.bat.

HASH=$(git rev-parse HEAD 2>/dev/null || echo "0000000000000000000000000000000000000000")

cat > src/gitrev.h << EOF
// DO NOT EDIT
// This file was created and will be overwritten by distSolution.py
// DO NOT EDIT

#ifndef GITREV_INCLUDED_
#define GITREV_INCLUDED_

#include <string>
#include <sstream>
namespace GITREV {
    static constexpr const char *hashes[][2] =  {

            {"SceneExplorer","${HASH}"},

    };
    inline std::string GetHashMessage() {
        std::stringstream message;
        for (auto&& s : hashes)
            message << s[0] << "=" << s[1] << std::endl;
        return message.str();
    }
}  // namespace GITREV
#endif  // GITREV_INCLUDED_
EOF

echo "Generated src/gitrev.h (hash: ${HASH})"
