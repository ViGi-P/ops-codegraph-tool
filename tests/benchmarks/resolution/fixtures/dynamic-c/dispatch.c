/* Fixture: C dynamic dispatch patterns
 * (*fp)(args) → flagged as unresolved-dynamic (function pointer; target unknown)
 * dlsym(handle, "symbol") → resolved as reflection (string literal matches symbol in DB)
 */
#include <stdio.h>
#include <dlfcn.h>

void greet(const char *name) {
    printf("Hello, %s\n", name);
}

void farewell(const char *name) {
    printf("Goodbye, %s\n", name);
}

/* (*fp)(args) — function pointer dereference; unresolvable statically */
void runFunctionPointer(void (*fp)(const char *)) {
    (*fp)("world");
}

/* dlsym(handle, "greet") — string literal resolves as reflection; fn pointer call flagged */
void runDlsym(void *handle) {
    void (*fn)(const char *) = dlsym(handle, "greet");
    if (fn) fn("world");
}
