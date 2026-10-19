// FlowNote's backend (src-tauri/core), built by native/ffi as a static library.
#include <stdint.h>

void flownote_init(const char *data_dir);
void flownote_trust(const char *root);
char *flownote_call(const char *command, const char *args);
void flownote_free(char *answer);
void flownote_shutdown(void);
