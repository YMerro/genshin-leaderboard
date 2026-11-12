# Run on a home Kubernetes cluster, reachable from the internet

This sets up the leaderboard on **your own PC** in a small Kubernetes cluster (k3d, which runs k3s inside Docker) and publishes it at `https://leaderboard.<your-domain>` through a **Cloudflare Tunnel**. You don't open any ports on your router, HTTPS is free, and your home IP stays hidden.

> Only do this on a PC and network you own. Not on a work computer.

```
Internet ──HTTPS──▶ Cloudflare ◀──outbound tunnel── cloudflared pod ──▶ leaderboard pod ──▶ data volume
                                                                         backup CronJob ──▶ backups volume (nightly)
```

What gets deployed (`deploy/k8s/overlays/home`):

| Resource | Purpose |
|---|---|
| `Deployment/leaderboard` + `Service` + `PVC leaderboard-data` (1 Gi) | The app and its data |
| `Deployment/cloudflared` | Tunnel to Cloudflare |
| `CronJob/leaderboard-backup` + `PVC leaderboard-backups` (2 Gi) | Archive of `/data` every night at 03:30, last 14 kept |
| Secrets `leaderboard-admin`, `cloudflared-token` | Created by you, never stored in git |

---

## 1. Requirements

| Need | Notes |
|---|---|
| Windows 10/11 PC you own, with admin rights | Virtualization enabled in BIOS (usually is). Linux works too, see the end. |
| ~4 GB free RAM, ~5 GB disk | The app uses about 400 MB |
| A domain name | Any registrar, ~€10/year. Its DNS must be managed by Cloudflare (step 3). No domain? See [Without a domain](#without-a-domain). |
| Free Cloudflare account | https://dash.cloudflare.com/sign-up |
| PC switched on | When it sleeps or shuts down, the site is offline |

## 2. Install the tools

In an **admin** PowerShell:

```powershell
wsl --install                       # reboot if asked
winget install Docker.DockerDesktop
winget install Kubernetes.kubectl k3d.k3d Git.Git
```

Start **Docker Desktop**, then in its Settings:
- General: **Use the WSL 2 based engine** on, **Start Docker Desktop when you sign in** on.
- Leave its own Kubernetes option **off** (k3d is used instead).

In Windows power settings, set **Sleep: Never** when plugged in, otherwise the site goes down when the PC sleeps.

Check:
```powershell
docker version
k3d version
kubectl version --client
```

## 3. Domain and Cloudflare Tunnel

1. In Cloudflare: **Add a site** → enter your domain → Free plan → at your registrar, change the nameservers to the two Cloudflare gives you. Wait until the site shows **Active** (minutes to a few hours).
2. Go to **Zero Trust** (left menu) → **Networks → Tunnels → Create a tunnel** → **Cloudflared** → name it `home-leaderboard`.
3. On the install page, choose any OS and **copy the token**: the long string after `--token` (starts with `eyJ`). Don't install anything; the cluster runs cloudflared. Click **Next**.
4. **Public hostname**:
   - Subdomain: `leaderboard`, Domain: your domain
   - Service type: `HTTP`, URL: `leaderboard.leaderboard.svc.cluster.local:80`
   - Save.

## 4. Create the cluster

```powershell
k3d cluster create home --agents 0 --servers 1 --k3s-arg "--disable=traefik@server:0"
kubectl get nodes
```
The node should be `Ready`. Traefik is disabled because the tunnel reaches the service directly.

The cluster restarts with Docker Desktop, so it comes back after a reboot on its own.

## 5. Make the image pullable

The image `ghcr.io/ymerro/genshin-leaderboard` is built by CI. Either:

- **Make it public** (easiest): GitHub → profile → **Packages** → genshin-leaderboard → **Package settings** → **Change visibility → Public**.
- Or keep it private and give the cluster a token (GitHub → Settings → Developer settings → Personal access tokens → classic, scope `read:packages`):
  ```powershell
  kubectl create namespace leaderboard
  kubectl -n leaderboard create secret docker-registry ghcr --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<token>
  kubectl -n leaderboard patch serviceaccount default -p '{\"imagePullSecrets\":[{\"name\":\"ghcr\"}]}'
  ```

## 6. Deploy

```powershell
git clone https://github.com/YMerro/genshin-leaderboard
cd genshin-leaderboard

kubectl create namespace leaderboard
kubectl -n leaderboard create secret generic leaderboard-admin --from-literal=password='<a long admin password>'
kubectl -n leaderboard create secret generic cloudflared-token --from-literal=token='<the eyJ... token>'

kubectl apply -k deploy/k8s/overlays/home
kubectl -n leaderboard rollout status deploy/leaderboard --timeout=5m
kubectl -n leaderboard get pods
```

Both `leaderboard-…` and `cloudflared-…` should be `Running` and `1/1`. (An "already exists" error for the namespace is fine.)

Pick a strong admin password (20+ random characters): the site is public and anyone can try it. After 20 wrong tries in 10 minutes admin actions lock for 10 minutes.

## 7. Check it

```powershell
kubectl -n leaderboard port-forward svc/leaderboard 8081:80    # local: http://localhost:8081, Ctrl+C to end
kubectl -n leaderboard logs deploy/cloudflared --tail=20       # should say "Registered tunnel connection" (x4)
```

Open `https://leaderboard.<your-domain>`. In Cloudflare, the tunnel should show **Healthy**. Click **Admin**, enter the password, add the players.

## 8. Move your existing data (optional)

To bring over friends, history and wishes from the Windows install (`%USERPROFILE%\GenshinLeaderboard\data`):

```powershell
$pod = kubectl -n leaderboard get pod -l app.kubernetes.io/name=genshin-leaderboard -o name
$pod = $pod -replace 'pod/', ''
cd $env:USERPROFILE\GenshinLeaderboard\data
kubectl -n leaderboard cp friends.json ${pod}:/data/friends.json
kubectl -n leaderboard cp history ${pod}:/data/history
kubectl -n leaderboard cp wishes ${pod}:/data/wishes
kubectl -n leaderboard rollout restart deploy/leaderboard
```
(Skip any folder that doesn't exist.)

---

## Day to day

| Task | Command |
|---|---|
| Status | `kubectl -n leaderboard get pods` |
| App logs | `kubectl -n leaderboard logs deploy/leaderboard -f` |
| Update to the newest version (after a push to `main` and green CI) | `kubectl -n leaderboard rollout restart deploy/leaderboard` |
| Apply changed manifests | `git pull` then `kubectl apply -k deploy/k8s/overlays/home` |
| Change admin password | `kubectl -n leaderboard create secret generic leaderboard-admin --from-literal=password='<new>' --dry-run=client -o yaml \| kubectl apply -f -` then `rollout restart deploy/leaderboard` |
| Take the site offline (keep data) | `kubectl -n leaderboard scale deploy/cloudflared --replicas=0` (back: `--replicas=1`) |
| Stop everything (keep data) | `k3d cluster stop home` (back: `k3d cluster start home`) |

### Backups

Run one now and list them:
```powershell
kubectl -n leaderboard create job --from=cronjob/leaderboard-backup backup-now
kubectl -n leaderboard logs job/backup-now
kubectl -n leaderboard run ls --rm -it --restart=Never --image=busybox:1.37 --overrides='{\"spec\":{\"volumes\":[{\"name\":\"b\",\"persistentVolumeClaim\":{\"claimName\":\"leaderboard-backups\"}}],\"containers\":[{\"name\":\"ls\",\"image\":\"busybox:1.37\",\"command\":[\"ls\",\"-lh\",\"/b\"],\"volumeMounts\":[{\"name\":\"b\",\"mountPath\":\"/b\"}]}]}}'
```

The backups volume is on the same PC. For a copy elsewhere, pull the data out now and then:
```powershell
kubectl -n leaderboard cp ${pod}:/data .\leaderboard-data-copy
```

Restore: copy files back into `/data` with `kubectl cp` as in step 8, then `rollout restart`.

### Remove everything

```powershell
kubectl delete -k deploy/k8s/overlays/home     # deletes the data volumes too: back up first
k3d cluster delete home
```
Then delete the tunnel in Cloudflare Zero Trust.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Pod `ImagePullBackOff` | Step 5: the image is private. `kubectl -n leaderboard describe pod <name>` |
| Pod `CreateContainerConfigError` | A secret is missing: `kubectl -n leaderboard get secrets` |
| `cloudflared` restarting | Wrong token: recreate the `cloudflared-token` secret and `rollout restart deploy/cloudflared` |
| Site shows Cloudflare error 502/1033 | Tunnel is up but can't reach the app: check the public hostname URL is exactly `leaderboard.leaderboard.svc.cluster.local:80`, and the app pod is `1/1` |
| Admin button says admin is disabled | `leaderboard-admin` secret missing or created after the pod: `rollout restart deploy/leaderboard` |
| Site down after reboot | Docker Desktop must be running; `k3d cluster list` then `k3d cluster start home` |

## Without a domain

- **Quick test, temporary URL** (changes every time, not for real use):
  ```powershell
  winget install Cloudflare.cloudflared
  kubectl -n leaderboard port-forward svc/leaderboard 8081:80    # in one window
  cloudflared tunnel --url http://localhost:8081                  # in another: prints https://<random>.trycloudflare.com
  ```
- **Permanent, free**: [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) with the [Tailscale Kubernetes operator](https://tailscale.com/kb/1236/kubernetes-operator) gives `https://<name>.<tailnet>.ts.net`. In that case deploy `deploy/k8s/base` (plus the two secrets you need) instead of the home overlay, and add an Ingress with `ingressClassName: tailscale` and the annotation `tailscale.com/funnel: "true"`.

## On Linux instead of Windows

Skip Docker Desktop and k3d, and install k3s directly:
```bash
curl -sfL https://get.k3s.io | sh -s - --disable traefik
sudo kubectl get nodes
```
Then follow steps 3, 5, 6 and 7 the same way (with `sudo kubectl`, or copy `/etc/rancher/k3s/k3s.yaml` to `~/.kube/config`). k3s starts at boot as a system service.
