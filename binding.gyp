{
    "targets": [{
        "target_name": "lsqpack",
        "cflags!": [ "-fno-exceptions" ],
        "cflags_cc!": [ "-fno-exceptions" ],
        "sources": [
            "lib/ls-qpack/lsqpack-bindings.c",
            "lib/ls-qpack/lsqpack.c",
            "lib/ls-qpack/xxhash.c"
        ],
        "include_dirs": [
            "lib/ls-qpack/include"
        ],
        "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
    }]
}