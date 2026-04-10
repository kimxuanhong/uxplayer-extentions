package main

import (
	"log"
	"os/exec"
	"sync"
	"time"

	"github.com/getlantern/systray"
)

var (
	uxplayCmd *exec.Cmd
	mu        sync.Mutex
)

// Gọi trong lock
func isRunning() bool {
	return uxplayCmd != nil
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

func updateMenuStatus(mToggle *systray.MenuItem) {
	mu.Lock()
	running := isRunning()
	mu.Unlock()

	if running {
		mToggle.SetTitle("Stop UxPlay")
	} else {
		mToggle.SetTitle("Start UxPlay")
	}
}

func onReady() {
	systray.SetTitle("AirPlay")
	systray.SetTooltip("UxPlay AirPlay Receiver")

	mToggle := systray.AddMenuItem("Start UxPlay", "Toggle UxPlay")
	mQuit := systray.AddMenuItem("Quit", "Quit")

	updateMenuStatus(mToggle)

	go func() {
		for {
			select {
			case <-mToggle.ClickedCh:
				mu.Lock()
				running := isRunning()
				mu.Unlock()

				if running {
					stopUxPlay()
				} else {
					startUxPlay()
				}

				time.Sleep(300 * time.Millisecond)
				updateMenuStatus(mToggle)

			case <-mQuit.ClickedCh:
				stopUxPlay()
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
