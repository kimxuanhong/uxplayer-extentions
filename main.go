package main

import (
"log"
"os/exec"
"sync"

"github.com/godbus/dbus/v5"
)

var (
uxplayCmd *exec.Cmd
mu        sync.Mutex
exitChan  = make(chan struct{})
)

// Gọi trong lock
func isRunning() bool {
return uxplayCmd != nil
}

// DBus Object
type UxPlay struct{}

func (u UxPlay) Toggle() (bool, *dbus.Error) {
mu.Lock()
running := isRunning()
mu.Unlock()

if running {
stopUxPlay()
return false, nil
} else {
startUxPlay()
return true, nil
}
}

func (u UxPlay) Status() (bool, *dbus.Error) {
mu.Lock()
defer mu.Unlock()
return isRunning(), nil
}

func (u UxPlay) Quit() (bool, *dbus.Error) {
stopUxPlay()
close(exitChan)
return true, nil
}

func initDBus() {
conn, err := dbus.ConnectSessionBus()
if err != nil {
log.Fatalf("Failed to connect to session bus: %v", err)
}

u := UxPlay{}
conn.Export(u, "/org/uxplay/Tray", "org.uxplay.Tray")
reply, err := conn.RequestName("org.uxplay.Tray", dbus.NameFlagDoNotQueue)
if err != nil {
log.Printf("Failed to request DBus name: %v", err)
return
}
if reply != dbus.RequestNameReplyPrimaryOwner {
log.Println("DBus name already taken")
}
}

func startUxPlay() {
mu.Lock()
defer mu.Unlock()

if isRunning() {
return
}

cmd := exec.Command("uxplay", "-n", "Ubuntu AirPlay")
if err := cmd.Start(); err != nil {
log.Printf("Failed to start uxplay: %v", err)
return
}

uxplayCmd = cmd
log.Printf("UxPlay started (PID: %d)", cmd.Process.Pid)

go func() {
cmd.Wait()
mu.Lock()
uxplayCmd = nil
mu.Unlock()
log.Println("UxPlay exited")
}()
}

func stopUxPlay() {
mu.Lock()
defer mu.Unlock()

if !isRunning() {
return
}

if err := uxplayCmd.Process.Kill(); err != nil {
log.Printf("Failed to kill uxplay: %v", err)
return
}

log.Printf("UxPlay stopped (PID: %d)", uxplayCmd.Process.Pid)
uxplayCmd = nil
}

func main() {
initDBus()
<-exitChan
}
