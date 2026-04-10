package main

import (
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/getlantern/systray"
)

var (
	uxplayProcess *os.Process
	mu            sync.Mutex
)

func getUxPlayPID() string {
	cmd := exec.Command("pgrep", "-o", "uxplay")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func isRunning() bool {
	return getUxPlayPID() != ""
}

func startUxPlay() error {
	mu.Lock()
	defer mu.Unlock()

	if isRunning() {
		log.Println("UxPlay already running")
		return nil
	}

	cmd := exec.Command("uxplay", "-n", "Ubuntu AirPlay")
	if err := cmd.Start(); err != nil {
		log.Printf("Failed to start uxplay: %v", err)
		return err
	}

	uxplayProcess = cmd.Process
	log.Printf("UxPlay started (PID: %d)", cmd.Process.Pid)

	go func() {
		cmd.Wait()
		mu.Lock()
		uxplayProcess = nil
		mu.Unlock()
		log.Println("UxPlay process exited")
	}()

	return nil
}

func stopUxPlay() error {
	mu.Lock()
	defer mu.Unlock()

	if uxplayProcess == nil {
		log.Println("UxPlay not running")
		return nil
	}

	if err := uxplayProcess.Kill(); err != nil {
		log.Printf("Failed to kill process: %v", err)
		return err
	}

	log.Printf("UxPlay stopped (PID: %d)", uxplayProcess.Pid)
	uxplayProcess = nil
	return nil
}

func updateMenuStatus(mToggle *systray.MenuItem) {
	if isRunning() {
		mToggle.SetTitle("Stop UxPlay")
		mToggle.SetTooltip("Click to stop UxPlay")
	} else {
		mToggle.SetTitle("Start UxPlay")
		mToggle.SetTooltip("Click to start UxPlay")
	}
}

func onReady() {
	systray.SetTitle("UxPlay")
	systray.SetTooltip("UxPlay AirPlay")

	mToggle := systray.AddMenuItem("Start UxPlay", "Click to toggle")
	mQuit := systray.AddMenuItem("Quit", "Quit app")

	updateMenuStatus(mToggle)

	go func() {
		for {
			select {
			case <-mToggle.ClickedCh:
				if isRunning() {
					stopUxPlay()
				} else {
					startUxPlay()
				}
				time.Sleep(200 * time.Millisecond)
				updateMenuStatus(mToggle)
			case <-mQuit.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}

func onExit() {}

func main() {
	systray.Run(onReady, onExit)
}
