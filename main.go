package main

import (
	"bufio"
	"log"
	"os/exec"
	"regexp"
	"strconv"
	"sync"

	"github.com/godbus/dbus/v5"
)

var (
	uxplayCmd *exec.Cmd
	mu        sync.Mutex
	exitChan  = make(chan struct{})
	isSharing bool
	dbusConn  *dbus.Conn
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

func (u UxPlay) IsSharing() (bool, *dbus.Error) {
	mu.Lock()
	defer mu.Unlock()
	return isSharing, nil
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
	dbusConn = conn

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

func updateSharingStatus(state bool, source string) {
	mu.Lock()
	defer mu.Unlock()

	if isSharing != state {
		isSharing = state
		log.Printf("--> [%s] Sharing status updating to: %v\n", source, isSharing)
		if dbusConn != nil {
			err := dbusConn.Emit("/org/uxplay/Tray", "org.uxplay.Tray.SharingChanged", isSharing)
			if err != nil {
				log.Printf("Failed to emit SharingChanged signal: %v", err)
			}
		}
	}
}

func startUxPlay() {
	mu.Lock()
	defer mu.Unlock()

	if isRunning() {
		return
	}

	// Try starting uxplay with unbuffered output using stdbuf
	cmd := exec.Command("stdbuf", "-i0", "-o0", "-e0", "uxplay", "-n", "Ubuntu AirPlay")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("Failed to create stdout pipe: %v", err)
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		log.Printf("Failed to create stderr pipe: %v", err)
		return
	}

	if err := cmd.Start(); err != nil {
		log.Printf("Failed to start uxplay: %v", err)
		return
	}

	uxplayCmd = cmd
	log.Printf("UxPlay started (PID: %d)", cmd.Process.Pid)

	// Goroutine to read stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		re := regexp.MustCompile(`Open connections: (\d+)`)
		for scanner.Scan() {
			line := scanner.Text()
			//log.Println("STDOUT:", line)
			if matches := re.FindStringSubmatch(line); len(matches) > 1 {
				count, err := strconv.Atoi(matches[1])
				if err == nil {
					updateSharingStatus(count > 0, "STDOUT")
				}
			}
		}
	}()

	// Goroutine to read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		re := regexp.MustCompile(`Open connections: (\d+)`)
		for scanner.Scan() {
			line := scanner.Text()
			//log.Println("STDERR:", line)
			if matches := re.FindStringSubmatch(line); len(matches) > 1 {
				count, err := strconv.Atoi(matches[1])
				if err == nil {
					updateSharingStatus(count > 0, "STDERR")
				}
			}
		}
	}()

	go func() {
		cmd.Wait()
		mu.Lock()
		uxplayCmd = nil
		mu.Unlock()
		updateSharingStatus(false, "EXIT")
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
