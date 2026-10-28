package main

import (
	"fmt"
	"net/http"
)

func health(w http.ResponseWriter, r *http.Request) { fmt.Fprintln(w, "ok") }

func main() {
	http.HandleFunc("/health", health)
	http.ListenAndServe(":8080", nil)
}
